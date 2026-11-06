import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handleSearchOpenMessage, openSearchPage } from '../src/search-navigation.ts';
import { translate } from '../src/i18n.ts';

const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
let creates: chrome.tabs.CreateProperties[];
let source: chrome.tabs.Tab;

beforeEach(() => {
  creates = [];
  source = { id: 42, index: 2, windowId: 9 } as chrome.tabs.Tab;
  globalThis.chrome = {
    runtime: { id: sender.id, getURL: (path: string) => `chrome-extension://${sender.id}/${path}` },
    storage: { local: { get: async () => ({ preferences: { language: 'en' } }) } },
    tabs: {
      get: async () => source,
      create: async (properties: chrome.tabs.CreateProperties) => { creates.push(properties); },
    },
  } as unknown as typeof chrome;
});

function invoke(message: unknown, origin: chrome.runtime.MessageSender = sender): Promise<unknown> {
  return new Promise((resolve) => {
    if (handleSearchOpenMessage(message, origin, resolve) === undefined) resolve(undefined);
  });
}

test('popup launches a neighboring local search page with normalized text in its fragment', async () => {
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV_SEARCH', query: '  attention\nmechanism ', tabId: 42 }), { ok: true });
  assert.deepEqual(creates, [{
    url: 'chrome-extension://test-extension/search.html#q=attention+mechanism&run=1',
    active: true, openerTabId: 42, index: 3, windowId: 9,
  }]);
});

test('untrusted pages and other extension pages cannot launch searches', async () => {
  for (const origin of [
    { ...sender, id: 'other-extension' }, { ...sender, url: 'https://example.org/' },
    { ...sender, url: 'chrome-extension://test-extension/search.html' },
    { ...sender, url: `${sender.url}#extra` }, { ...sender, url: `${sender.url}?extra` }, { id: sender.id },
  ]) assert.equal(await invoke({ type: 'OPEN_ARXIV_SEARCH', query: 'attention' }, origin), undefined);
  assert.deepEqual(creates, []);
});

test('invalid input and tab IDs are rejected before navigation', async () => {
  for (const request of [null, 'search', {}, { type: 'UNKNOWN' },
    { type: 'OPEN_ARXIV_SEARCH', query: null }, { type: 'OPEN_ARXIV_SEARCH', query: '' },
    { type: 'OPEN_ARXIV_SEARCH', query: 'x'.repeat(301) }, { type: 'OPEN_ARXIV_SEARCH', query: '\u0000test' },
    ...[-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '42', null].map((tabId) => ({ type: 'OPEN_ARXIV_SEARCH', query: 'attention', tabId })),
  ]) assert.equal(await invoke(request), undefined);
  assert.deepEqual(creates, []);
});

test('search navigation safely encodes fragment-looking text into a fixed local destination', async () => {
  await openSearchPage('attention #q=other&run=0 https://evil.example/');
  const url = new URL(creates[0]!.url!);
  assert.equal(url.protocol, 'chrome-extension:');
  assert.equal(url.host, 'test-extension');
  assert.equal(url.pathname, '/search.html');
  assert.equal(url.search, '');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(url.hash.slice(1))), {
    q: 'attention #q=other&run=0 https://evil.example/', run: '1',
  });
  await assert.rejects(() => openSearchPage('x'.repeat(301)), TypeError);
  assert.equal(creates.length, 1);
});

test('search launch succeeds without a source or when the source tab has closed', async () => {
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV_SEARCH', query: 'attention' }), { ok: true });
  chrome.tabs.get = async () => { throw new Error('Tab closed'); };
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV_SEARCH', query: 'attention', tabId: 42 }), { ok: true });
  assert.deepEqual(creates, Array(2).fill({ url: 'chrome-extension://test-extension/search.html#q=attention&run=1', active: true }));
});

test('a source closing between lookup and creation falls back to an ordinary new tab', async () => {
  let lookups = 0;
  chrome.tabs.get = async () => { if (++lookups > 1) throw new Error('Tab closed'); return source; };
  chrome.tabs.create = async (properties: chrome.tabs.CreateProperties) => {
    if (properties.openerTabId !== undefined) throw new Error('Invalid opener tab');
    creates.push(properties);
    return {} as chrome.tabs.Tab;
  };
  await openSearchPage('attention', source);
  assert.deepEqual(creates, [{ url: 'chrome-extension://test-extension/search.html#q=attention&run=1', active: true }]);
});

test('browser failures return a localized action error and do not retry a live source', async () => {
  let calls = 0;
  chrome.tabs.create = async () => { calls++; throw new Error('Browser unavailable'); };
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV_SEARCH', query: 'attention', tabId: 42 }), {
    ok: false, error: translate('openFailed', 'en'),
  });
  assert.equal(calls, 1);
  chrome.storage.local.get = async () => { throw new Error('Storage unavailable'); };
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV_SEARCH', query: 'attention' }), {
    ok: false, error: translate('openFailed', 'en'),
  });
});
