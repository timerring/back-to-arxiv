import { parsePaperInput } from './paper';
import { MAX_METADATA_IDS, MAX_METADATA_RESPONSE_BYTES, METADATA_ORIGIN, type MetadataError, type MetadataResponse } from './metadata-protocol';

export { MAX_METADATA_IDS, METADATA_ORIGIN, type MetadataResponse } from './metadata-protocol';

export const METADATA_INTERVAL_MS = 3_000;
export const METADATA_TIMEOUT_MS = 20_000;
export const MAX_METADATA_PENDING = 20;
export const METADATA_PACING_KEY = 'metadataNextRequestAt';

type Timer = ReturnType<typeof setTimeout>;
interface MetadataDependencies {
  fetch: typeof fetch;
  now: () => number;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  hasPermission: () => Promise<boolean>;
  readNextRequestAt: () => Promise<unknown>;
  writeNextRequestAt: (timestamp: number) => Promise<void>;
  startTimeout: (callback: () => void, milliseconds: number) => Timer;
  clearTimeout: (timer: Timer) => void;
}

interface Job {
  key: string;
  owner: string;
  tabId: number | undefined;
  ids: string[];
  controller: AbortController;
  respond: (response: MetadataResponse) => void;
  settled: boolean;
  reason?: MetadataError;
}

class MetadataFailure extends Error {
  constructor(readonly code: MetadataError) { super(code); }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new MetadataFailure('cancelled')); return; }
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new MetadataFailure('cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > MAX_METADATA_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new MetadataFailure('tooLarge');
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  const abort = (): void => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new MetadataFailure('cancelled');
      const { done, value } = await reader.read();
      if (signal.aborted) throw new MetadataFailure('cancelled');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_METADATA_RESPONSE_BYTES) {
        await reader.cancel();
        throw new MetadataFailure('tooLarge');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/** One queue spans every workbench tab; session storage keeps only a pacing timestamp. */
export function createMetadataService(overrides: Partial<MetadataDependencies> = {}) {
  const dependencies: MetadataDependencies = {
    fetch: (input, init) => globalThis.fetch(input, init),
    now: () => Date.now(),
    wait,
    hasPermission: () => chrome.permissions.contains({ origins: [METADATA_ORIGIN] }),
    readNextRequestAt: async () => (await chrome.storage.session.get(METADATA_PACING_KEY))[METADATA_PACING_KEY],
    writeNextRequestAt: (timestamp) => chrome.storage.session.set({ [METADATA_PACING_KEY]: timestamp }),
    startTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (timer) => clearTimeout(timer),
    ...overrides,
  };
  const jobs = new Map<string, Job>();
  const queue: Job[] = [];
  let pumping = false;

  function reply(respond: Job['respond'], response: MetadataResponse): void {
    // A tab may close before its response arrives.
    try { respond(response); } catch { /* The closed receiver needs no further work. */ }
  }

  function finish(job: Job, response: MetadataResponse): void {
    if (job.settled) return;
    job.settled = true;
    jobs.delete(job.key);
    reply(job.respond, response);
  }

  function cancel(job: Job): void {
    job.reason = 'cancelled';
    job.controller.abort();
    const queued = queue.indexOf(job);
    if (queued >= 0) queue.splice(queued, 1);
    finish(job, { ok: false, error: 'cancelled' });
  }

  async function execute(job: Job): Promise<MetadataResponse> {
    const signal = job.controller.signal;
    if (signal.aborted) throw new MetadataFailure('cancelled');
    if (await dependencies.hasPermission() === false) return { ok: false, error: 'permissionDenied' };
    const stored = await dependencies.readNextRequestAt();
    const now = dependencies.now();
    const next = typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : 0;
    // A reserved slot also survives a service-worker restart during a request.
    const delay = Math.min(Math.max(0, next - now), METADATA_TIMEOUT_MS + METADATA_INTERVAL_MS);
    if (delay > 0) await dependencies.wait(delay, signal);
    if (signal.aborted) throw new MetadataFailure('cancelled');
    if (await dependencies.hasPermission() === false) return { ok: false, error: 'permissionDenied' };

    const reservationTime = dependencies.now();
    await dependencies.writeNextRequestAt(reservationTime + METADATA_TIMEOUT_MS + METADATA_INTERVAL_MS);
    // A stalled storage write must not consume the reservation before HTTP begins.
    if (dependencies.now() - reservationTime > METADATA_INTERVAL_MS) throw new MetadataFailure('network');
    if (signal.aborted) throw new MetadataFailure('cancelled');
    const timeout = dependencies.startTimeout(() => {
      job.reason = 'timeout';
      job.controller.abort();
    }, METADATA_TIMEOUT_MS);
    try {
      const url = new URL('https://export.arxiv.org/api/query');
      url.searchParams.set('id_list', job.ids.join(','));
      url.searchParams.set('max_results', String(job.ids.length));
      const response = await dependencies.fetch(url.href, {
        method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/atom+xml' }, signal,
      });
      if (response.ok === false) {
        await response.body?.cancel();
        throw new MetadataFailure('http');
      }
      const xml = await readBoundedResponse(response, signal);
      return { ok: true, xml };
    } finally {
      dependencies.clearTimeout(timeout);
      // Waiting three seconds after completion also respects the interval between starts.
      await dependencies.writeNextRequestAt(dependencies.now() + METADATA_INTERVAL_MS);
    }
  }

  function pump(): void {
    if (pumping) return;
    pumping = true;
    void (async () => {
      while (queue.length > 0) {
        const job = queue.shift()!;
        if (job.settled) continue;
        try {
          finish(job, await execute(job));
        } catch (error) {
          finish(job, { ok: false, error: job.reason ?? (error instanceof MetadataFailure ? error.code : 'network') });
        }
      }
      pumping = false;
    })();
  }

  function handleMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MetadataResponse) => void,
  ): true | undefined {
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('batch.html') || typeof message !== 'object' || message === null) return;
    const request = message as Record<string, unknown>;
    if (request.type !== 'FETCH_CITATION_METADATA' && request.type !== 'CANCEL_CITATION_METADATA') return;
    if (typeof request.requestId !== 'string' || /^[A-Za-z0-9_-]{1,80}$/.test(request.requestId) === false) {
      reply(sendResponse, { ok: false, error: 'invalidRequest' });
      return true;
    }
    const owner = sender.documentId ? `document:${sender.documentId}` : `tab:${sender.tab?.id ?? 'extension'}`;
    const key = `${owner}:${request.requestId}`;
    if (request.type === 'CANCEL_CITATION_METADATA') {
      const job = jobs.get(key);
      if (job !== undefined) cancel(job);
      reply(sendResponse, { ok: false, error: 'cancelled' });
      return true;
    }
    const ids = request.ids;
    if (Array.isArray(ids) === false || ids.length === 0 || ids.length > MAX_METADATA_IDS
      || ids.some((id) => typeof id !== 'string' || id.length > 128 || parsePaperInput(id)?.id !== id)
      || new Set(ids).size !== ids.length || jobs.has(key)) {
      reply(sendResponse, { ok: false, error: 'invalidRequest' });
      return true;
    }
    if (jobs.size >= MAX_METADATA_PENDING) {
      reply(sendResponse, { ok: false, error: 'busy' });
      return true;
    }
    const job: Job = { key, owner, tabId: sender.tab?.id, ids: [...ids], controller: new AbortController(), respond: sendResponse, settled: false };
    jobs.set(key, job);
    queue.push(job);
    pump();
    return true;
  }

  function cancelTab(tabId: number): void {
    for (const job of jobs.values()) if (job.tabId === tabId) cancel(job);
  }

  return { handleMessage, cancelTab };
}

const service = createMetadataService();
export const handleMetadataMessage = service.handleMessage;
export const cancelMetadataTab = service.cancelTab;
