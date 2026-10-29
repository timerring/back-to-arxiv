import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionPath = join(root, 'dist');
const output = join(root, 'test-results', 'memory.json');
await mkdir(dirname(output), { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'back-to-arxiv-memory-'));
const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
const sourceUrl = 'https://www.alphaxiv.org/abs/1706.03762v3';
const defaults = { format: 'abs', version: 'current', openInNewTab: false, language: 'en' };
const fixture = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local memory fixture</title></head><body><h1>Paper fixture</h1><p>All HTTP requests in this test are fulfilled locally.</p></body></html>';
const report = {
  extensionVersion: manifest.version,
  startedAt: new Date().toISOString(),
  status: 'running',
  coverage: {
    content: 'One persistent alphaXiv fixture document; SPA uses replaceState to keep browser history size constant.',
    popup: 'Actual popup.html documents in test tabs, initialized and manually edited; native toolbar popups are not repeatedly opened.',
    measurement: 'CDP Runtime.getHeapUsage and Memory.getDOMCounters after two HeapProfiler.collectGarbage calls. Values describe the CDP target measurement scope, not total Chrome RSS.',
    processIdentity: 'OS renderer process IDs are not mapped. A before/open/closed probe records whether the persistent extension target observes an additional popup document.',
    limitations: [
      'This finite fixture test detects resource accumulation in the exercised paths; it cannot prove absence of all leaks or reproduce live-site memory use.',
      'Forced-GC measurements exclude reclaimable allocations; Chrome renderer/process caches and OS memory are outside these counters.',
      'Service-worker memory, BFCache document eviction, and browser-launch crashes are outside this test.',
    ],
  },
  actions: { warmupSpa: 0, measuredSpa: 0, restoredDocks: 0, preferenceRounds: 0, warmupPopups: 0, measuredPopups: 0 },
  samples: [],
  crashes: [],
  pageErrors: [],
  assertions: [],
};

let context;
let paper;
let sentinel;
let contentCdp;
let extensionCdp;
let failure;
let baselinePageCount = 0;
const watchedPages = new WeakSet();

function watchPage(page) {
  if (watchedPages.has(page)) return;
  watchedPages.add(page);
  page.on('crash', () => report.crashes.push({ url: page.url(), at: new Date().toISOString() }));
  page.on('pageerror', (error) => report.pageErrors.push({ url: page.url(), message: error.message }));
}

async function waitFor(page, predicate, argument) {
  // waitForFunction returns a remote handle; dispose it so the measuring code
  // does not itself retain a series of objects in the page's utility world.
  const handle = await page.waitForFunction(predicate, argument);
  await handle.dispose();
}

async function resourceSample(session) {
  await measuredCommand(session, 'HeapProfiler.collectGarbage');
  await measuredCommand(session, 'Runtime.evaluate', {
    expression: 'new Promise(resolve => setTimeout(() => resolve(0), 0))',
    awaitPromise: true,
    returnByValue: true,
  });
  await measuredCommand(session, 'HeapProfiler.collectGarbage');
  const heap = await measuredCommand(session, 'Runtime.getHeapUsage');
  const dom = await measuredCommand(session, 'Memory.getDOMCounters');
  return {
    usedHeapBytes: heap.usedSize,
    totalHeapBytes: heap.totalSize,
    ...(heap.embedderHeapUsedSize === undefined ? {} : { embedderHeapUsedBytes: heap.embedderHeapUsedSize }),
    ...(heap.backingStorageSize === undefined ? {} : { backingStorageBytes: heap.backingStorageSize }),
    documents: dom.documents,
    nodes: dom.nodes,
    jsEventListeners: dom.jsEventListeners,
  };
}

async function measuredCommand(session, method, parameters) {
  let timeout;
  try {
    return await Promise.race([
      session.send(method, parameters),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Memory measurement timed out: ${method}`)), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkpoint(stage) {
  const sample = {
    stage,
    at: new Date().toISOString(),
    pageCount: context.pages().length,
    hostCount: await paper.locator('#back-to-arxiv-root').count(),
    content: await resourceSample(contentCdp),
    extension: await resourceSample(extensionCdp),
  };
  report.samples.push(sample);
  assert.ok(sample.hostCount <= 1, 'Each document has at most one extension dock');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${stage}: ${JSON.stringify(sample)}`);
  return sample;
}

async function settleDock(expectedHref = 'https://arxiv.org/abs/1706.03762v3') {
  await waitFor(paper, (href) => {
    const hosts = document.querySelectorAll('#back-to-arxiv-root');
    return hosts.length === 1 && hosts[0].shadowRoot?.querySelector('#open-paper')?.href === href;
  }, expectedHref);
}

async function navigatePaper(path) {
  await paper.evaluate((next) => history.replaceState(null, '', next), path);
  if (path === '/') {
    await waitFor(paper, () => document.querySelectorAll('#back-to-arxiv-root').length === 0);
  } else {
    await settleDock(`https://arxiv.org${path}`);
  }
  assert.ok(await paper.locator('#back-to-arxiv-root').count() <= 1);
}

async function spaRounds(count, measured) {
  await paper.bringToFront();
  for (let index = 0; index < count; index++) {
    const path = index % 5 === 0 ? '/' : index % 5 === 1 ? '/abs/hep-th/9901001v2' : '/abs/1706.03762v3';
    await navigatePaper(path);
    if (measured) report.actions.measuredSpa++;
    else report.actions.warmupSpa++;
    if (index % 5 === 2) {
      await paper.evaluate(() => document.querySelector('#back-to-arxiv-root')?.remove());
      await settleDock();
      report.actions.restoredDocks++;
    }
    // Pace realistic SPA navigation and stay below Chrome's history IPC flood
    // protection; this delay is not used to decide whether an assertion passed.
    await delay(80);
  }
  await navigatePaper('/abs/1706.03762v3');
}

async function preferences(value) {
  await sentinel.evaluate((next) => chrome.storage.local.set({ preferences: next }), value);
  await waitFor(sentinel, (next) => document.getElementById(`format-${next.format}`)?.checked === true
    && document.getElementById('paper-version')?.value === next.version
    && document.getElementById('language')?.value === next.language, value);
}

async function preferenceRounds(count, measured) {
  for (let index = 0; index < count; index++) {
    const next = {
      format: ['abs', 'pdf', 'html'][index % 3],
      version: index % 2 === 0 ? 'latest' : 'current',
      openInNewTab: index % 2 === 0,
      language: index % 2 === 0 ? 'zh_CN' : 'en',
    };
    await preferences(next);
    await settleDock(`https://arxiv.org/${next.format}/1706.03762${next.version === 'current' ? 'v3' : ''}`);
    await paper.locator('#back-to-arxiv-root #open-menu-toggle').click();
    await paper.locator('#back-to-arxiv-root #open-abs').press('Escape');
    await paper.locator('#back-to-arxiv-root #copy-menu-toggle').click();
    await paper.locator('#back-to-arxiv-root #copy-markdown').press('Escape');
    if (measured) report.actions.preferenceRounds++;
  }
  await preferences(defaults);
  await settleDock();
}

async function exercisePopup(extensionId, whileOpen) {
  const popup = await context.newPage();
  try {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await waitFor(popup, () => document.getElementById('language')?.disabled === false);
    await popup.locator('#paper-input').fill('arXiv:1706.03762v3');
    assert.equal(await popup.locator('#paper-id').innerText(), '1706.03762v3');
    await popup.locator('#open-menu-toggle').click();
    await popup.locator('#open-abs').press('Escape');
    await popup.locator('#copy-menu-toggle').click();
    await popup.locator('#copy-markdown').press('Escape');
    await popup.locator('#paper-input').fill('invalid paper input');
    assert.equal(await popup.locator('#open-paper').isDisabled(), true);
    await popup.locator('#use-current-page').click();
    if (whileOpen) await whileOpen();
  } finally {
    await popup.close();
  }
}

function assertStableScope(name, samples) {
  const base = samples[0][name];
  const allowances = {
    documents: 1,
    jsEventListeners: 4,
    nodes: 128,
    usedHeapBytes: Math.max(8 * 1024 * 1024, Math.ceil(base.usedHeapBytes * 0.5)),
  };
  for (const [metric, allowance] of Object.entries(allowances)) {
    const values = samples.map((sample) => sample[name][metric]);
    const check = {
      scope: name,
      metric,
      baseline: base[metric],
      values,
      maximum: Math.max(...values),
      finalDelta: values.at(-1) - values[0],
      allowedGrowth: allowance,
      passed: Math.max(...values) <= base[metric] + allowance,
    };
    report.assertions.push(check);
    assert.ok(check.passed, `${name} ${metric} grew beyond the post-warmup allowance: ${JSON.stringify(check)}`);
  }
}

try {
  console.log('Launching isolated memory-test browser…');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', ...(process.env.CHROMIUM_LOAD_EXTENSION_VIA_CDP === '1'
      ? [] : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`])],
  });
  context.setDefaultTimeout(15000);
  console.log('Browser launched; preparing local fixtures…');
  report.browserVersion = context.browser().version();
  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
  // Intercept every page HTTP(S) request, including unanticipated site assets.
  await context.route(/^https?:\/\//, (route) => route.request().resourceType() === 'document'
    ? route.fulfill({ status: 200, contentType: 'text/html', body: fixture })
    : route.fulfill({ status: 204, body: '' }));
  if (process.env.CHROMIUM_LOAD_EXTENSION_VIA_CDP === '1') {
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: extensionPath });
    await cdp.detach();
  }
  console.log('Extension loaded; opening the paper fixture…');
  const extensionId = new URL((context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')).url()).host;
  report.extensionId = extensionId;
  paper = await context.newPage();
  await paper.goto(sourceUrl);
  await settleDock();
  console.log('Content script ready; opening the extension measurement page…');
  sentinel = await context.newPage();
  await sentinel.goto(`chrome-extension://${extensionId}/popup.html`);
  await waitFor(sentinel, () => document.getElementById('language')?.disabled === false);
  await preferences(defaults);
  console.log('Popup ready; collecting baseline counters…');
  contentCdp = await context.newCDPSession(paper);
  extensionCdp = await context.newCDPSession(sentinel);
  baselinePageCount = context.pages().length;
  report.baselinePageCount = baselinePageCount;
  await checkpoint('start');

  await spaRounds(40, false);
  await preferenceRounds(5, false);
  for (let index = 0; index < 4; index++) {
    await exercisePopup(extensionId);
    report.actions.warmupPopups++;
  }

  const before = await resourceSample(extensionCdp);
  let during;
  await exercisePopup(extensionId, async () => { during = await resourceSample(extensionCdp); });
  const after = await resourceSample(extensionCdp);
  const sharedCounterVisibility = during.documents > before.documents && during.nodes > before.nodes;
  report.popupCounterProbe = { before, during, after, sharedCounterVisibility };
  report.coverage.popupCounterScope = sharedCounterVisibility
    ? 'The extension sentinel observed additional documents and nodes while another popup document was open. Post-close samples cover this observed shared counter scope; this is not an OS PID mapping.'
    : 'The extension sentinel did not establish visibility of another popup document. Its counters alone cannot establish reclamation in all popup renderer processes; closed-page counts are still verified.';
  if (sharedCounterVisibility === false) report.coverage.limitations.push('Popup renderer sharing was not established by the counter probe; popup leak coverage is limited to page disposal and the observed sentinel scope.');
  const warm = await checkpoint('warm');

  for (let batch = 1; batch <= 5; batch++) {
    await spaRounds(100, true);
    await checkpoint(`spa-${batch * 100}`);
  }
  await preferenceRounds(20, true);
  await checkpoint('preferences-20');
  for (let batch = 1; batch <= 4; batch++) {
    for (let index = 0; index < 10; index++) {
      await exercisePopup(extensionId);
      report.actions.measuredPopups++;
      assert.equal(context.pages().length, baselinePageCount, 'A closed popup leaves no additional browser page');
    }
    await checkpoint(`popups-${batch * 10}`);
  }
  await settleDock();
  const end = await checkpoint('end');
  assert.equal(end.pageCount, baselinePageCount, 'The final page count matches the persistent baseline');
  assert.equal(end.hostCount, 1, 'The paper retains one dock after the stress test');
  assert.equal(report.actions.measuredSpa, 500);
  assert.equal(report.actions.preferenceRounds, 20);
  assert.equal(report.actions.measuredPopups, 40);
  assert.deepEqual(report.crashes, []);
  assert.deepEqual(report.pageErrors, []);
  const stableSamples = report.samples.slice(report.samples.indexOf(warm));
  assertStableScope('content', stableSamples);
  assertStableScope('extension', stableSamples);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack };
} finally {
  try {
    await contentCdp?.detach().catch(() => undefined);
    await extensionCdp?.detach().catch(() => undefined);
    await context?.close();
  } catch (error) {
    failure ??= error;
    report.status = 'failed';
    report.cleanupError = error.message;
  } finally {
    await rm(profile, { recursive: true, force: true });
    report.finishedAt = new Date().toISOString();
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
}
console.log(`Memory regression ${report.status}. Report: ${output}`);
if (failure) throw failure;
