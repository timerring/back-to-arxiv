import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { openPaperTab } from '../src/navigation.ts';
import { translate } from '../src/i18n.ts';
import type { Preferences } from '../src/settings.ts';

let preferences: Preferences;
let updates: Array<{ id: number; properties: chrome.tabs.UpdateProperties }>;
let creates: chrome.tabs.CreateProperties[];
let latestTab: chrome.tabs.Tab;

const paperTab = (patch: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
  id: 42,
  index: 2,
  windowId: 9,
  url: 'https://www.alphaxiv.org/overview/1706.03762v3?utm_source=test#discussion',
  ...patch,
} as chrome.tabs.Tab);

async function navigate(tab = paperTab()): Promise<void> {
  latestTab = tab;
  await openPaperTab(tab);
}

beforeEach(() => {
  preferences = { format: 'abs', openInNewTab: false, language: 'en' };
  updates = [];
  creates = [];
  latestTab = paperTab();
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: { local: { get: async () => ({ preferences }) } },
    tabs: {
      get: async () => latestTab,
      update: async (id: number, properties: chrome.tabs.UpdateProperties) => { updates.push({ id, properties }); },
      create: async (properties: chrome.tabs.CreateProperties) => { creates.push(properties); },
    },
  } as unknown as typeof chrome;
});

test('current-tab action keeps the paper version and strips source-only parameters', async () => {
  await navigate();
  assert.deepEqual(updates, [{ id: 42, properties: { url: 'https://arxiv.org/abs/1706.03762v3' } }]);
  assert.deepEqual(creates, []);
});

test('new-tab PDF action uses the same window and sits next to its source', async () => {
  preferences = { format: 'pdf', openInNewTab: true, language: 'en' };
  await navigate();
  assert.deepEqual(creates, [{
    url: 'https://arxiv.org/pdf/1706.03762v3',
    active: true,
    openerTabId: 42,
    index: 3,
    windowId: 9,
  }]);
  assert.deepEqual(updates, []);
});

test('HTML opens the versioned paper in the current tab', async () => {
  preferences = { format: 'html', openInNewTab: false, language: 'en' };
  await navigate();
  assert.deepEqual(updates, [{ id: 42, properties: { url: 'https://arxiv.org/html/1706.03762v3' } }]);
  assert.deepEqual(creates, []);
});

test('HTML in a new tab retains the source tab and explicit paper version', async () => {
  preferences = { format: 'html', openInNewTab: true, language: 'en' };
  await navigate();
  assert.deepEqual(creates, [{
    url: 'https://arxiv.org/html/1706.03762v3',
    active: true,
    openerTabId: 42,
    index: 3,
    windowId: 9,
  }]);
  assert.deepEqual(updates, []);
});

test('in-flight navigation selects the pending paper rather than the previous document', async () => {
  await navigate(paperTab({ pendingUrl: 'https://www.alphaxiv.org/abs/hep-th/9901001v2' }));
  assert.equal(updates[0]?.properties.url, 'https://arxiv.org/abs/hep-th/9901001v2');
});

test('a pending unsupported page stops an action on the old paper', async () => {
  await assert.rejects(() => navigate(paperTab({ pendingUrl: 'https://example.org/' })), /alphaXiv/);
  assert.deepEqual(updates, []);
  assert.deepEqual(creates, []);
});

test('unsupported pages and missing tab identifiers leave browser tabs intact', async () => {
  for (const tab of [paperTab({ url: 'https://www.alphaxiv.org/' }), paperTab({ url: undefined }), paperTab({ id: undefined })]) {
    await assert.rejects(() => navigate(tab));
  }
  assert.deepEqual(updates, []);
  assert.deepEqual(creates, []);
});

test('browser navigation errors are returned to the action UI', async () => {
  chrome.tabs.update = async () => { throw new Error('Tab was closed'); };
  await assert.rejects(() => navigate(), /Tab was closed/);
});

test('navigation during a preference read uses the freshly selected paper', async () => {
  const initialTab = paperTab();
  chrome.storage.local.get = async () => {
    latestTab = paperTab({ url: 'https://www.alphaxiv.org/abs/2401.12345v2', index: 6, windowId: 12 });
    return { preferences: { format: 'pdf', openInNewTab: true } };
  };
  await openPaperTab(initialTab);
  assert.deepEqual(creates, [{
    url: 'https://arxiv.org/pdf/2401.12345v2', active: true, openerTabId: 42, index: 7, windowId: 12,
  }]);
});

test('navigation to an unrelated page during preference loading leaves it untouched', async () => {
  const initialTab = paperTab();
  chrome.storage.local.get = async () => {
    latestTab = paperTab({ pendingUrl: 'https://example.org/' });
    return { preferences };
  };
  await assert.rejects(() => openPaperTab(initialTab), /alphaXiv/);
  assert.deepEqual(updates, []);
  assert.deepEqual(creates, []);
});


test('navigation guidance uses the selected language', async () => {
  for (const language of ['en', 'zh_CN', 'auto'] as const) {
    preferences.language = language;
    await assert.rejects(() => navigate(paperTab({ url: 'https://example.org/' })), {
      message: translate('unsupportedPage', language),
    });
    await assert.rejects(() => navigate(paperTab({ id: undefined })), {
      message: translate('invalidTab', language),
    });
  }
});
