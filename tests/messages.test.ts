import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { handleOpenMessage } from '../src/messages.ts';
import { translate } from '../src/i18n.ts';

const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
let created: chrome.tabs.CreateProperties[];
let updated: Array<{ id: number; value: chrome.tabs.UpdateProperties }>;
let tab: chrome.tabs.Tab;

beforeEach(() => {
  created = [];
  updated = [];
  tab = { id: 42, index: 2, windowId: 9, url: 'https://alphaxiv.org/abs/1706.03762v3' } as chrome.tabs.Tab;
  globalThis.chrome = {
    runtime: { id: sender.id, getURL: (path: string) => `chrome-extension://${sender.id}/${path}` },
    storage: { local: { get: async () => ({ preferences: { format: 'abs', version: 'current', openInNewTab: false, language: 'en' } }) } },
    tabs: {
      get: async () => tab,
      create: async (value: chrome.tabs.CreateProperties) => { created.push(value); },
      update: async (id: number, value: chrome.tabs.UpdateProperties) => { updated.push({ id, value }); },
    },
  } as unknown as typeof chrome;
});

function invoke(message: unknown, origin: chrome.runtime.MessageSender = sender): Promise<unknown> {
  return new Promise((resolve) => {
    const result = handleOpenMessage(message, origin, resolve);
    if (result === undefined) resolve(undefined);
  });
}

test('trusted popup can temporarily open the current paper or explicitly entered paper', async () => {
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV', tabId: 42, format: 'pdf' }), { ok: true });
  assert.deepEqual(updated, [{ id: 42, value: { url: 'https://arxiv.org/pdf/1706.03762v3' } }]);
  assert.deepEqual(await invoke({ type: 'OPEN_INPUT_ARXIV', input: 'hep-th/9901001v2', tabId: 42, format: 'html' }), { ok: true });
  assert.equal(created[0]?.url, 'https://arxiv.org/html/hep-th/9901001v2');
});

test('page scripts, content scripts and other extension pages cannot send open requests', async () => {
  for (const origin of [
    { ...sender, id: 'another-extension' },
    { ...sender, url: 'https://alphaxiv.org/abs/1706.03762' },
    { ...sender, url: 'chrome-extension://test-extension/other.html' },
    { ...sender, url: 'chrome-extension://other-extension/popup.html' },
    { id: sender.id },
  ]) {
    assert.equal(await invoke({ type: 'OPEN_INPUT_ARXIV', input: '1706.03762', format: 'pdf' }, origin), undefined);
  }
  assert.deepEqual(created, []);
  assert.deepEqual(updated, []);
});

test('message validation rejects malformed format, input and tab fields before navigation', async () => {
  for (const request of [null, 'OPEN_ARXIV', {}, { type: 'UNKNOWN' },
    { type: 'OPEN_ARXIV' }, { type: 'OPEN_ARXIV', tabId: -1 }, { type: 'OPEN_ARXIV', tabId: 1.5 },
    { type: 'OPEN_ARXIV', tabId: 42, format: 'javascript:alert(1)' },
    { type: 'OPEN_INPUT_ARXIV', input: {} }, { type: 'OPEN_INPUT_ARXIV', input: '1706.03762', tabId: '42' },
    { type: 'OPEN_INPUT_ARXIV', input: '1706.03762', format: null },
  ]) assert.equal(await invoke(request), undefined);
  assert.deepEqual(created, []);
  assert.deepEqual(updated, []);
});

test('invalid entered text reports an input error rather than opening the source paper', async () => {
  assert.deepEqual(await invoke({ type: 'OPEN_INPUT_ARXIV', input: 'bad input', tabId: 42 }), {
    ok: false, error: translate('invalidPaperInput'),
  });
  assert.deepEqual(created, []);
  assert.deepEqual(updated, []);
});

test('explicit input succeeds when the originating tab has closed', async () => {
  chrome.tabs.get = async () => { throw new Error('Tab closed'); };
  assert.deepEqual(await invoke({ type: 'OPEN_INPUT_ARXIV', input: '1706.03762v3', tabId: 42 }), { ok: true });
  assert.deepEqual(created, [{ url: 'https://arxiv.org/abs/1706.03762v3', active: true }]);
});

test('navigation and storage failures return actionable responses', async () => {
  chrome.tabs.create = async () => { throw new Error('Browser unavailable'); };
  assert.deepEqual(await invoke({ type: 'OPEN_INPUT_ARXIV', input: '1706.03762' }), { ok: false, error: translate('openFailed') });
  chrome.storage.local.get = async () => { throw new Error('Storage unavailable'); };
  assert.deepEqual(await invoke({ type: 'OPEN_ARXIV', tabId: 42 }), { ok: false, error: translate('openFailed') });
});
