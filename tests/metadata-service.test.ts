import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createMetadataService, MAX_METADATA_PENDING, METADATA_INTERVAL_MS, METADATA_TIMEOUT_MS } from '../src/metadata-service.ts';
import { MAX_METADATA_IDS, MAX_METADATA_RESPONSE_BYTES, METADATA_ORIGIN, type MetadataResponse } from '../src/metadata-protocol.ts';

const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/batch.html', documentId: 'first-document', tab: { id: 42 } } as chrome.runtime.MessageSender;
const xml = '<feed xmlns="http://www.w3.org/2005/Atom"/>';
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');

beforeEach(() => {
  globalThis.chrome = { runtime: { id: sender.id, getURL: (path: string) => `chrome-extension://${sender.id}/${path}` } } as unknown as typeof chrome;
});

function harness() {
  const state = {
    now: 10_000,
    next: undefined as unknown,
    permission: true,
    requests: [] as Array<{ url: string; init: RequestInit; started: number }>,
    writes: [] as number[],
    waits: [] as number[],
    timers: new Map<ReturnType<typeof setTimeout>, () => void>(),
    fetch: async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => new Response(xml),
  };
  const dependencies = {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      state.requests.push({ url: String(url), init: init!, started: state.now });
      return state.fetch(url, init);
    }) as typeof fetch,
    now: () => state.now,
    wait: async (milliseconds: number, signal: AbortSignal) => {
      signal.throwIfAborted();
      state.waits.push(milliseconds);
      state.now += milliseconds;
    },
    hasPermission: async () => state.permission,
    readNextRequestAt: async () => state.next,
    writeNextRequestAt: async (timestamp: number) => { state.next = timestamp; state.writes.push(timestamp); },
    startTimeout: (callback: () => void, milliseconds: number) => {
      assert.equal(milliseconds, METADATA_TIMEOUT_MS);
      const timer = {} as ReturnType<typeof setTimeout>;
      state.timers.set(timer, callback);
      return timer;
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => { state.timers.delete(timer); },
  };
  return { state, dependencies };
}

function invoke(service: ReturnType<typeof createMetadataService>, message: unknown, origin = sender): Promise<MetadataResponse | undefined> {
  return new Promise((resolve) => {
    if (service.handleMessage(message, origin, resolve) === undefined) resolve(undefined);
  });
}
const request = (requestId: string, ids = ['1706.03762v3']) => ({ type: 'FETCH_CITATION_METADATA', requestId, ids });
const cancel = (requestId: string) => ({ type: 'CANCEL_CITATION_METADATA', requestId });
const searchSender = { ...sender, url: 'chrome-extension://test-extension/search.html', documentId: 'search-document', tab: { id: 43 } } as chrome.runtime.MessageSender;
const searchRequest = (requestId: string, query: unknown = 'attention mechanism', start: unknown = 0) => ({ type: 'SEARCH_ARXIV', requestId, query, start });
const cancelSearch = (requestId: string) => ({ type: 'CANCEL_ARXIV_SEARCH', requestId });

test('only the trusted workbench can request metadata or cancel a request', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  for (const origin of [
    { ...sender, id: 'another-extension' },
    { ...sender, url: 'https://alphaxiv.org/abs/1706.03762' },
    { ...sender, url: 'chrome-extension://test-extension/popup.html' },
    { ...sender, url: `${sender.url}?other=true` },
    { id: sender.id },
  ]) {
    assert.equal(await invoke(service, request('origin-test'), origin), undefined);
    assert.equal(await invoke(service, cancel('origin-test'), origin), undefined);
  }
  assert.equal(await invoke(service, { type: 'SOME_OTHER_MESSAGE' }), undefined);
  assert.deepEqual(h.state.requests, []);
  assert.deepEqual(h.state.writes, []);
});

test('known metadata requests reject invalid fields, URLs and duplicate IDs before any network activity', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  for (const bad of [
    { type: 'FETCH_CITATION_METADATA', ids: ['1706.03762'] },
    { ...request('valid'), requestId: '../bad' }, { ...request('valid'), requestId: 'x'.repeat(81) },
    request('empty', []), request('duplicates', ['1706.03762', '1706.03762']),
    request('url', ['https://arxiv.org/abs/1706.03762']), request('prefix', ['arXiv:1706.03762']),
    request('doi', ['10.48550/arXiv.1706.03762']), request('space', [' 1706.03762 ']),
    request('bad-version', ['1706.03762v0']), request('too-many', Array(MAX_METADATA_IDS + 1).fill('1706.03762')),
    { ...request('wrong-ids'), ids: '1706.03762' }, { ...request('wrong-item'), ids: [null] },
    { type: 'CANCEL_CITATION_METADATA', requestId: '' },
  ]) assert.deepEqual(await invoke(service, bad), { ok: false, error: 'invalidRequest' });
  assert.deepEqual(h.state.requests, []);
  assert.deepEqual(h.state.writes, []);
});

test('explicit metadata input generates one fixed-origin query and omits credentials and referrers', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  assert.deepEqual(await invoke(service, request('query', ['1706.03762v3', 'hep-th/9901001v2'])), { ok: true, xml });
  const sent = h.state.requests[0]!;
  const url = new URL(sent.url);
  assert.equal(url.origin, 'https://export.arxiv.org');
  assert.equal(url.pathname, '/api/query');
  assert.equal(url.searchParams.get('id_list'), '1706.03762v3,hep-th/9901001v2');
  assert.equal(url.searchParams.get('max_results'), '2');
  assert.equal(sent.init.method, 'GET');
  assert.equal(sent.init.credentials, 'omit');
  assert.equal(sent.init.referrerPolicy, 'no-referrer');
  assert.equal(sent.init.redirect, 'error');
  assert.deepEqual(sent.init.headers, { Accept: 'application/atom+xml' });
  assert.equal(h.state.requests.length, 1);
  assert.deepEqual(h.state.writes, [10_000 + METADATA_TIMEOUT_MS + METADATA_INTERVAL_MS, 10_000 + METADATA_INTERVAL_MS]);
  assert.equal(h.state.timers.size, 0);
});

test('denied or revoked optional permission prevents HTTP requests and preserves local-only operation', async () => {
  const h = harness();
  h.state.permission = false;
  const service = createMetadataService(h.dependencies);
  assert.deepEqual(await invoke(service, request('denied')), { ok: false, error: 'permissionDenied' });
  assert.deepEqual(h.state.requests, []);
  assert.deepEqual(h.state.writes, []);
  let permissionChecks = 0;
  h.dependencies.hasPermission = async () => ++permissionChecks === 1;
  const revokeDuringWait = createMetadataService(h.dependencies);
  h.state.next = h.state.now + 3_000;
  assert.deepEqual(await invoke(revokeDuringWait, request('revoked')), { ok: false, error: 'permissionDenied' });
  assert.deepEqual(h.state.requests, []);
});

test('one queue spans documents and serializes HTTP bodies with at least three seconds after completion', async () => {
  const h = harness();
  let completeFirst: (() => void) | undefined;
  h.state.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (h.state.requests.length === 1) completeFirst = () => {
        h.state.now += 2_000;
        controller.enqueue(new TextEncoder().encode(xml));
        controller.close();
      };
      else { controller.enqueue(new TextEncoder().encode(xml)); controller.close(); }
    },
  }));
  const service = createMetadataService(h.dependencies);
  const first = invoke(service, request('first'));
  const second = invoke(service, request('second'), { ...sender, documentId: 'second-document' });
  await tick();
  assert.equal(h.state.requests.length, 1, 'The second document waits while the first body is open');
  completeFirst!();
  assert.deepEqual(await first, { ok: true, xml });
  assert.deepEqual(await second, { ok: true, xml });
  assert.deepEqual(h.state.requests.map((sent) => sent.started), [10_000, 15_000]);
  assert.deepEqual(h.state.waits, [3_000]);
});

test('a new service instance respects the session timestamp, including an interrupted-request reservation', async () => {
  const h = harness();
  assert.deepEqual(await invoke(createMetadataService(h.dependencies), request('before-restart')), { ok: true, xml });
  assert.deepEqual(await invoke(createMetadataService(h.dependencies), request('after-restart')), { ok: true, xml });
  assert.deepEqual(h.state.waits, [METADATA_INTERVAL_MS]);
  h.state.next = h.state.now + METADATA_TIMEOUT_MS + METADATA_INTERVAL_MS;
  assert.deepEqual(await invoke(createMetadataService(h.dependencies), request('interrupted-request')), { ok: true, xml });
  assert.equal(h.state.waits.at(-1), METADATA_TIMEOUT_MS + METADATA_INTERVAL_MS);
});

test('session storage failures fail closed and a later repaired request can succeed', async () => {
  const h = harness();
  const unreadable = createMetadataService({ ...h.dependencies, readNextRequestAt: async () => { throw new Error('Storage unavailable'); } });
  assert.deepEqual(await invoke(unreadable, request('read-failed')), { ok: false, error: 'network' });
  const unwritable = createMetadataService({ ...h.dependencies, writeNextRequestAt: async () => { throw new Error('Storage unavailable'); } });
  assert.deepEqual(await invoke(unwritable, request('write-failed')), { ok: false, error: 'network' });
  assert.deepEqual(h.state.requests, []);
  assert.deepEqual(await invoke(createMetadataService(h.dependencies), request('repaired')), { ok: true, xml });
});

test('queued cancellation replies immediately, is scoped to the sender, and does not issue extra HTTP calls', async () => {
  const h = harness();
  let release: ((response: Response) => void) | undefined;
  h.state.fetch = async () => new Promise<Response>((resolve) => { release = resolve; });
  const service = createMetadataService(h.dependencies);
  const active = invoke(service, request('active'));
  const queued = invoke(service, request('queued'));
  await tick();
  await invoke(service, cancel('active'), { ...sender, documentId: 'other-document' });
  assert.equal(h.state.requests[0]!.init.signal!.aborted, false, 'Another document cannot cancel the active job');
  assert.deepEqual(await invoke(service, cancel('queued')), { ok: false, error: 'cancelled' });
  assert.deepEqual(await queued, { ok: false, error: 'cancelled' });
  release!(new Response(xml));
  assert.deepEqual(await active, { ok: true, xml });
  await tick();
  assert.equal(h.state.requests.length, 1);
});

test('in-flight cancellation aborts its connection and lets the next queued request finish', async () => {
  const h = harness();
  h.state.fetch = async (_url, init) => h.state.requests.length === 1
    ? new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }))
    : new Response(xml);
  const service = createMetadataService(h.dependencies);
  const active = invoke(service, request('active'));
  const next = invoke(service, request('next'));
  await tick();
  await invoke(service, cancel('active'));
  assert.deepEqual(await active, { ok: false, error: 'cancelled' });
  assert.deepEqual(await next, { ok: true, xml });
  assert.equal(h.state.requests[0]!.init.signal!.aborted, true);
  assert.equal(h.state.requests.length, 2);
  assert.equal(h.state.timers.size, 0);
});

test('tab closure cancels its queued and active work without cancelling another tab', async () => {
  const h = harness();
  h.state.fetch = async (_url, init) => h.state.requests.length === 1
    ? new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }))
    : new Response(xml);
  const service = createMetadataService(h.dependencies);
  const active = invoke(service, request('active'));
  const queued = invoke(service, request('queued'));
  const other = invoke(service, request('other'), { ...sender, documentId: 'other-document', tab: { id: 43 } } as chrome.runtime.MessageSender);
  await tick();
  service.cancelTab(42);
  assert.deepEqual(await active, { ok: false, error: 'cancelled' });
  assert.deepEqual(await queued, { ok: false, error: 'cancelled' });
  assert.deepEqual(await other, { ok: true, xml });
  assert.equal(h.state.requests.length, 2);
});

test('request timeouts abort the connection, return a stable error and leave the queue usable', async () => {
  const h = harness();
  h.state.fetch = async (_url, init) => h.state.requests.length === 1
    ? new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }))
    : new Response(xml);
  const service = createMetadataService(h.dependencies);
  const timedOut = invoke(service, request('timeout'));
  await tick();
  const fire = [...h.state.timers.values()][0]!;
  fire();
  assert.deepEqual(await timedOut, { ok: false, error: 'timeout' });
  assert.equal(h.state.requests[0]!.init.signal!.aborted, true);
  assert.deepEqual(await invoke(service, request('after-timeout')), { ok: true, xml });
  assert.equal(h.state.timers.size, 0);
});

test('HTTP and network failures are reported once without hidden retries', async () => {
  for (const [fetch, expected] of [
    [async () => new Response('Server busy', { status: 503 }), 'http'],
    [async () => { throw new Error('Offline'); }, 'network'],
  ] as const) {
    const h = harness();
    h.state.fetch = fetch;
    assert.deepEqual(await invoke(createMetadataService(h.dependencies), request('failure')), { ok: false, error: expected });
    assert.equal(h.state.requests.length, 1);
    assert.equal(h.state.timers.size, 0);
  }
});

test('response limits reject both advertised and streamed oversized bodies and cancel consumption', async () => {
  for (const advertised of [true, false]) {
    const h = harness();
    let cancelled = false;
    h.state.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_METADATA_RESPONSE_BYTES / 2 + 1));
        controller.enqueue(new Uint8Array(MAX_METADATA_RESPONSE_BYTES / 2 + 1));
      },
      cancel() { cancelled = true; },
    }), { headers: advertised ? { 'content-length': String(MAX_METADATA_RESPONSE_BYTES + 1) } : {} });
    assert.deepEqual(await invoke(createMetadataService(h.dependencies), request('too-large')), { ok: false, error: 'tooLarge' });
    assert.equal(cancelled, true);
    assert.equal(h.state.timers.size, 0);
  }
});

test('bounded pending work rejects overload and cancelled queue slots are immediately reusable', async () => {
  const h = harness();
  h.state.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }));
  const service = createMetadataService(h.dependencies);
  const pending = Array.from({ length: MAX_METADATA_PENDING }, (_, index) => invoke(service, request(`job-${index}`)));
  await tick();
  assert.deepEqual(await invoke(service, request('overloaded')), { ok: false, error: 'busy' });
  assert.deepEqual(await invoke(service, request('job-0')), { ok: false, error: 'invalidRequest' }, 'An active request ID cannot be reused');
  await invoke(service, cancel('job-1'));
  assert.deepEqual(await pending[1], { ok: false, error: 'cancelled' });
  const replacement = invoke(service, request('replacement'));
  service.cancelTab(42);
  assert.deepEqual(await replacement, { ok: false, error: 'cancelled' });
  for (const response of await Promise.all(pending)) assert.deepEqual(response, { ok: false, error: 'cancelled' });
  await tick();
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.timers.size, 0);
});

test('the production adapter uses only the declared optional origin and a timestamp in session storage', async () => {
  const h = harness();
  const permissions: unknown[] = [];
  const reads: unknown[] = [];
  const writes: Record<string, unknown>[] = [];
  globalThis.chrome = {
    ...chrome,
    permissions: { contains: async (value: unknown) => { permissions.push(value); return true; } },
    storage: { session: {
      get: async (key: unknown) => { reads.push(key); return {}; },
      set: async (value: Record<string, unknown>) => { writes.push(value); },
    } },
  } as unknown as typeof chrome;
  const { hasPermission: _permission, readNextRequestAt: _read, writeNextRequestAt: _write, ...overrides } = h.dependencies;
  assert.deepEqual(await invoke(createMetadataService(overrides), request('adapter')), { ok: true, xml });
  assert.deepEqual(permissions, [{ origins: [METADATA_ORIGIN] }, { origins: [METADATA_ORIGIN] }]);
  assert.deepEqual(reads, ['metadataNextRequestAt']);
  assert.equal(writes.length, 2);
  assert.ok(writes.every((value) => Object.keys(value).join() === 'metadataNextRequestAt' && typeof value.metadataNextRequestAt === 'number'));
});

test('search and metadata requests and cancellations are restricted to their exact trusted pages', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  for (const origin of [sender, { ...searchSender, id: 'other-extension' },
    { ...searchSender, url: `${searchSender.url}.other#q=attention` },
    { ...searchSender, url: `${searchSender.url}?q=attention` },
    { ...searchSender, url: 'https://arxiv.org/search/' }, { id: sender.id },
  ]) {
    assert.equal(await invoke(service, searchRequest('blocked'), origin), undefined);
    assert.equal(await invoke(service, cancelSearch('blocked'), origin), undefined);
  }
  assert.equal(await invoke(service, request('blocked'), searchSender), undefined);
  assert.equal(await invoke(service, cancel('blocked'), searchSender), undefined);
  assert.deepEqual(h.state.requests, []);
  assert.deepEqual(h.state.writes, []);
});

test('search validates bounded query, request ID and ten-result offsets before queueing', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  for (const bad of [
    ...[null, '', ' ', 42, {}, 'x'.repeat(301), '\u0000attention'].map((query) => searchRequest('invalid', query)),
    { ...searchRequest('invalid'), query: undefined },
    ...[-10, 1, 200, 1.5, NaN, Infinity, '10', null].map((start) => searchRequest('invalid', 'attention', start)),
    { type: 'SEARCH_ARXIV', requestId: 'missing-offset', query: 'attention' },
    { ...searchRequest('valid'), requestId: '' }, { ...searchRequest('valid'), requestId: '../bad' },
    { ...searchRequest('valid'), requestId: 'x'.repeat(81) },
    { type: 'CANCEL_ARXIV_SEARCH', requestId: 'bad id' },
  ]) assert.deepEqual(await invoke(service, bad, searchSender), { ok: false, error: 'invalidRequest' });
  assert.deepEqual(h.state.requests, []);
  assert.deepEqual(h.state.writes, []);
});

test('search uses a fixed API destination with normalized quoted terms and a bounded page', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  assert.deepEqual(await invoke(service, searchRequest('query', ' attention\n OR cat:cs.AI ', 190), searchSender), { ok: true, xml });
  const sent = h.state.requests[0]!;
  const url = new URL(sent.url);
  assert.equal(url.origin, 'https://export.arxiv.org');
  assert.equal(url.pathname, '/api/query');
  assert.equal(url.searchParams.get('search_query'), 'all:"attention" AND all:"OR" AND all:"cat:cs.AI"');
  assert.equal(url.searchParams.get('start'), '190');
  assert.equal(url.searchParams.get('max_results'), '10');
  assert.equal(url.searchParams.get('id_list'), null);
  assert.equal(url.searchParams.get('sortBy'), 'relevance');
  assert.equal(sent.init.credentials, 'omit');
  assert.equal(sent.init.redirect, 'error');
  assert.equal(sent.init.referrerPolicy, 'no-referrer');
  assert.deepEqual(sent.init.headers, { Accept: 'application/atom+xml' });
  assert.equal(h.state.requests.length, 1);
});

test('search and metadata share one connection and wait three seconds after each completed body', async () => {
  const h = harness();
  let completeFirst: (() => void) | undefined;
  h.state.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const complete = () => { controller.enqueue(new TextEncoder().encode(xml)); controller.close(); };
      if (h.state.requests.length === 1) completeFirst = () => { h.state.now += 2_000; complete(); };
      else complete();
    },
  }));
  const service = createMetadataService(h.dependencies);
  const pending = [invoke(service, searchRequest('first'), searchSender), invoke(service, request('second')),
    invoke(service, searchRequest('third', 'graph networks', 10), searchSender)];
  await tick();
  assert.equal(h.state.requests.length, 1);
  completeFirst!();
  for (const result of await Promise.all(pending)) assert.deepEqual(result, { ok: true, xml });
  assert.deepEqual(h.state.requests.map((sent) => sent.started), [10_000, 15_000, 18_000]);
  assert.deepEqual(h.state.requests.map((sent) => new URL(sent.url).searchParams.has('id_list')), [false, true, false]);
  assert.deepEqual(h.state.waits, [3_000, 3_000]);
});

test('search cancellations are scoped to the owning page and document while tab closure cancels both kinds', async () => {
  const h = harness();
  h.state.fetch = async (_url, init) => h.state.requests.length === 1
    ? new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }))
    : new Response(xml);
  const service = createMetadataService(h.dependencies);
  const active = invoke(service, searchRequest('shared'), searchSender);
  const queued = invoke(service, searchRequest('queued'), searchSender);
  const metadata = invoke(service, request('shared'), { ...sender, tab: searchSender.tab });
  const other = invoke(service, searchRequest('other'), { ...searchSender, documentId: 'other-document', tab: { id: 44 } } as chrome.runtime.MessageSender);
  await tick();
  await invoke(service, cancelSearch('shared'), { ...searchSender, documentId: 'other-document' });
  await invoke(service, cancel('shared'), { ...sender, documentId: searchSender.documentId });
  assert.equal(h.state.requests[0]!.init.signal!.aborted, false);
  await invoke(service, cancelSearch('queued'), searchSender);
  assert.deepEqual(await queued, { ok: false, error: 'cancelled' });
  service.cancelTab(43);
  assert.deepEqual(await active, { ok: false, error: 'cancelled' });
  assert.deepEqual(await metadata, { ok: false, error: 'cancelled' });
  assert.deepEqual(await other, { ok: true, xml });
  assert.equal(h.state.requests.length, 2);
});

test('search uses the shared timeout, response cap and permission checks without retries', async () => {
  const denied = harness();
  denied.state.permission = false;
  assert.deepEqual(await invoke(createMetadataService(denied.dependencies), searchRequest('denied'), searchSender), { ok: false, error: 'permissionDenied' });
  assert.deepEqual(denied.state.requests, []);
  for (const [fetch, expected] of [
    [async () => new Response('busy', { status: 503 }), 'http'],
    [async () => { throw new Error('Offline'); }, 'network'],
    [async () => new Response('', { headers: { 'content-length': String(MAX_METADATA_RESPONSE_BYTES + 1) } }), 'tooLarge'],
    [async () => new Response(new Uint8Array(MAX_METADATA_RESPONSE_BYTES + 1)), 'tooLarge'],
  ] as const) {
    const h = harness();
    h.state.fetch = fetch;
    assert.deepEqual(await invoke(createMetadataService(h.dependencies), searchRequest('failure'), searchSender), { ok: false, error: expected });
    assert.equal(h.state.requests.length, 1);
    assert.equal(h.state.timers.size, 0);
  }
  const h = harness();
  h.state.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }));
  const service = createMetadataService(h.dependencies);
  const pending = invoke(service, searchRequest('timeout'), searchSender);
  await tick();
  [...h.state.timers.values()][0]!();
  assert.deepEqual(await pending, { ok: false, error: 'timeout' });
  assert.equal(h.state.timers.size, 0);
});

test('metadata and search share pending capacity and search IDs cannot be reused while pending', async () => {
  const h = harness();
  h.state.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(abortError()), { once: true }));
  const service = createMetadataService(h.dependencies);
  const pending = Array.from({ length: MAX_METADATA_PENDING }, (_, index) => index % 2
    ? invoke(service, request(`job-${index}`)) : invoke(service, searchRequest(`job-${index}`), searchSender));
  await tick();
  assert.deepEqual(await invoke(service, searchRequest('job-0'), searchSender), { ok: false, error: 'invalidRequest' });
  assert.deepEqual(await invoke(service, searchRequest('overloaded'), searchSender), { ok: false, error: 'busy' });
  assert.deepEqual(await invoke(service, request('overloaded')), { ok: false, error: 'busy' });
  service.cancelTab(42);
  service.cancelTab(43);
  for (const result of await Promise.all(pending)) assert.deepEqual(result, { ok: false, error: 'cancelled' });
  await tick();
  assert.equal(h.state.requests.length, 1);
});

test('Chrome may retain the original search launch fragment on the message sender', async () => {
  const h = harness();
  const service = createMetadataService(h.dependencies);
  const launch = { ...searchSender, url: `${searchSender.url}#q=attention&run=1` };
  assert.deepEqual(await invoke(service, searchRequest('launch'), launch), { ok: true, xml });
  assert.equal(h.state.requests.length, 1);
});
