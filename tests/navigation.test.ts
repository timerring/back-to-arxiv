import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { openPaperInput, openPaperLink, openPaperTab } from '../src/navigation.ts';
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
  preferences = { format: 'abs', openInNewTab: false, language: 'en', version: 'current' };
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
  preferences = { format: 'pdf', openInNewTab: true, language: 'en', version: 'current' };
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
  preferences = { format: 'html', openInNewTab: false, language: 'en', version: 'current' };
  await navigate();
  assert.deepEqual(updates, [{ id: 42, properties: { url: 'https://arxiv.org/html/1706.03762v3' } }]);
  assert.deepEqual(creates, []);
});

test('HTML in a new tab retains the source tab and explicit paper version', async () => {
  preferences = { format: 'html', openInNewTab: true, language: 'en', version: 'current' };
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

test('latest-version preference applies to both current and new-tab navigation', async () => {
  preferences.version = 'latest';
  preferences.format = 'html';
  await navigate();
  assert.equal(updates[0]?.properties.url, 'https://arxiv.org/html/1706.03762');
  preferences.openInNewTab = true;
  await navigate(paperTab({ url: 'https://arxiv.org/pdf/hep-th/9901001v2.pdf' }));
  assert.equal(creates[0]?.url, 'https://arxiv.org/html/hep-th/9901001');
});

test('context link uses the clicked URL from an unrelated source and opens a neighboring new tab', async () => {
  preferences.format = 'pdf';
  latestTab = paperTab({ url: undefined, pendingUrl: undefined, index: 6, windowId: 12 });
  await openPaperLink('https://www.alphaxiv.org/abs/2401.12345v2?utm_source=test#discussion', latestTab);
  assert.deepEqual(creates, [{
    url: 'https://arxiv.org/pdf/2401.12345v2', active: true, openerTabId: 42, index: 7, windowId: 12,
  }]);
  assert.deepEqual(updates, []);
});

test('context link applies the latest-version preference independently of its source page', async () => {
  preferences.version = 'latest';
  preferences.format = 'html';
  latestTab = paperTab({ url: 'https://example.org/reading-list' });
  await openPaperLink('https://arxiv.org/abs/math.GT/0309136v2', latestTab);
  assert.equal(creates[0]?.url, 'https://arxiv.org/html/math.GT/0309136');
  assert.deepEqual(updates, []);
});

test('context link can open when the source tab is absent or closes during the action', async () => {
  await openPaperLink('https://alphaxiv.org/abs/1706.03762v3');
  chrome.tabs.get = async () => { throw new Error('Tab was closed'); };
  await openPaperLink('https://alphaxiv.org/abs/1706.03762v3', paperTab());
  assert.deepEqual(creates, [
    { url: 'https://arxiv.org/abs/1706.03762v3', active: true },
    { url: 'https://arxiv.org/abs/1706.03762v3', active: true },
  ]);
  assert.deepEqual(updates, []);
});

test('unsupported and misleading context links leave browser tabs intact', async () => {
  for (const url of [
    'https://example.org/abs/1706.03762',
    'https://alphaxiv.org.evil.example/abs/1706.03762',
    'https://alphaxiv.org/abs/1706.03762v0',
    'https://alphaxiv.org/abs/1706.03762/comments',
    'https://user@alphaxiv.org/abs/1706.03762',
    'javascript:alert(1)',
  ]) {
    await assert.rejects(() => openPaperLink(url, paperTab()), /alphaXiv/);
  }
  assert.deepEqual(creates, []);
  assert.deepEqual(updates, []);
});

test('context-link tab creation failures are returned to the caller', async () => {
  chrome.tabs.create = async () => { throw new Error('Browser unavailable'); };
  await assert.rejects(() => openPaperLink('https://alphaxiv.org/abs/1706.03762v3', paperTab()), /Browser unavailable/);
});

test('temporary formats preserve saved preferences and respect the current-page tab policy', async () => {
  preferences = { format: 'abs', version: 'latest', openInNewTab: false, language: 'en' };
  const saved = structuredClone(preferences);
  await openPaperTab(paperTab(), 'pdf');
  assert.deepEqual(updates, [{ id: 42, properties: { url: 'https://arxiv.org/pdf/1706.03762' } }]);
  assert.deepEqual(preferences, saved);
  preferences.openInNewTab = true;
  await openPaperTab(paperTab(), 'html');
  assert.equal(creates[0]?.url, 'https://arxiv.org/html/1706.03762');
  assert.equal(preferences.format, 'abs');
});

test('explicit input opens a new tab next to an unrelated source even with current-tab defaults', async () => {
  latestTab = paperTab({ url: 'https://example.org/inbox' });
  const saved = structuredClone(preferences);
  await openPaperInput(' arXiv:hep-th/9901001v2 ', latestTab, 'pdf');
  assert.deepEqual(creates, [{ url: 'https://arxiv.org/pdf/hep-th/9901001v2', active: true, openerTabId: 42, index: 3, windowId: 9 }]);
  assert.deepEqual(updates, []);
  assert.deepEqual(preferences, saved);
});

test('explicit input uses saved version and format and supports a closed or absent source', async () => {
  preferences = { format: 'html', version: 'latest', openInNewTab: false, language: 'en' };
  await openPaperInput('https://alphaxiv.org/abs/1706.03762v3');
  chrome.tabs.get = async () => { throw new Error('Tab closed'); };
  await openPaperInput('1706.03762v3', paperTab());
  assert.deepEqual(creates, [
    { url: 'https://arxiv.org/html/1706.03762', active: true },
    { url: 'https://arxiv.org/html/1706.03762', active: true },
  ]);
});

test('invalid explicit input and temporary formats leave tabs intact', async () => {
  for (const input of ['not a paper', '1706.03762v0', 'https://evil.example/abs/1706.03762']) {
    await assert.rejects(() => openPaperInput(input, paperTab()), { message: translate('invalidPaperInput', 'en') });
  }
  await assert.rejects(() => openPaperTab(paperTab(), 'bad-format' as 'pdf'), TypeError);
  await assert.rejects(() => openPaperInput('1706.03762v3', paperTab(), 'bad-format' as 'pdf'), TypeError);
  assert.deepEqual(creates, []);
  assert.deepEqual(updates, []);
});
