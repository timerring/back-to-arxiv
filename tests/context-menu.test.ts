import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { PAPER_LINK_MENU_ID, PAPER_LINK_PATTERNS, registerContextMenu } from '../src/context-menu.ts';
import { translate } from '../src/i18n.ts';
import { DEFAULT_PREFERENCES, type Preferences } from '../src/settings.ts';

function event<Args extends unknown[]>() {
  const listeners: Array<(...args: Args) => void> = [];
  return {
    listeners,
    addListener: (listener: (...args: Args) => void) => { listeners.push(listener); },
    emit: (...args: Args) => { for (const listener of listeners) listener(...args); },
  };
}

let preferences: Preferences;
let menu: chrome.contextMenus.CreateProperties | undefined;
let createCalls: number;
let updateCalls: number;
let createFailure: string | undefined;
let creates: chrome.tabs.CreateProperties[];
let logs: unknown[][];
let installed: ReturnType<typeof event<[]>>;
let startup: ReturnType<typeof event<[]>>;
let changed: ReturnType<typeof event<[Record<string, chrome.storage.StorageChange>, string]>>;
let clicked: ReturnType<typeof event<[chrome.contextMenus.OnClickData, chrome.tabs.Tab?]>>;

beforeEach(() => {
  preferences = { ...DEFAULT_PREFERENCES };
  menu = undefined;
  createCalls = 0;
  updateCalls = 0;
  createFailure = undefined;
  creates = [];
  logs = [];
  installed = event<[]>();
  startup = event<[]>();
  changed = event<[Record<string, chrome.storage.StorageChange>, string]>();
  clicked = event<[chrome.contextMenus.OnClickData, chrome.tabs.Tab?]>();
  mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });

  const runtime: { lastError?: { message: string }; onInstalled: typeof installed; onStartup: typeof startup } = {
    onInstalled: installed,
    onStartup: startup,
  };
  const complete = (callback: () => void, message?: string): void => {
    runtime.lastError = message ? { message } : undefined;
    try { callback(); } finally { runtime.lastError = undefined; }
  };
  globalThis.chrome = {
    runtime,
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: {
      local: { get: async () => ({ preferences: structuredClone(preferences) }) },
      onChanged: changed,
    },
    contextMenus: {
      onClicked: clicked,
      update: (id: string, properties: Omit<chrome.contextMenus.CreateProperties, 'id'>, callback: () => void) => {
        updateCalls++;
        queueMicrotask(() => {
          if (menu?.id === id) {
            menu = { ...menu, ...properties } as chrome.contextMenus.CreateProperties;
            complete(callback);
          } else complete(callback, 'Menu item is missing');
        });
      },
      create: (properties: chrome.contextMenus.CreateProperties, callback: () => void) => {
        createCalls++;
        queueMicrotask(() => {
          const error = createFailure ?? (menu ? 'Duplicate menu item' : undefined);
          if (error === undefined) menu = structuredClone(properties);
          complete(callback, error);
        });
        return properties.id!;
      },
    },
    tabs: {
      get: async (id: number) => ({ id, index: 2, windowId: 9 }),
      create: async (properties: chrome.tabs.CreateProperties) => { creates.push(properties); },
    },
  } as unknown as typeof chrome;
});

afterEach(() => { mock.restoreAll(); });

const settleActions = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test('initialization registers handlers synchronously and creates one filtered link menu', async () => {
  const refresh = registerContextMenu();
  assert.equal(installed.listeners.length, 1);
  assert.equal(startup.listeners.length, 1);
  assert.equal(changed.listeners.length, 1);
  assert.equal(clicked.listeners.length, 1);
  await refresh();
  assert.equal(menu?.id, PAPER_LINK_MENU_ID);
  assert.equal(menu?.title, translate('contextMenuOpen', 'en'));
  assert.deepEqual(menu?.contexts, ['link']);
  assert.deepEqual(menu?.targetUrlPatterns, PAPER_LINK_PATTERNS);
  assert.equal(menu?.documentUrlPatterns, undefined, 'Paper links can be opened from other websites');
  assert.equal(PAPER_LINK_PATTERNS.length, 14);
  assert.ok(PAPER_LINK_PATTERNS.every((pattern) => /^\*:\/\/(www\.)?(alphaxiv|arxiv)\.org\/(abs|pdf|html|overview)\/\*$/.test(pattern)));
  assert.equal(createCalls, 1);
  assert.deepEqual(logs, []);
});

test('worker initialization updates a persisted menu and installation/startup events serialize updates', async () => {
  menu = { id: PAPER_LINK_MENU_ID, title: 'Previous title', contexts: ['link'] };
  const refresh = registerContextMenu();
  installed.emit();
  startup.emit();
  await refresh();
  assert.equal(menu.title, translate('contextMenuOpen', 'en'));
  assert.equal(createCalls, 0);
  assert.equal(updateCalls, 4);
  assert.deepEqual(logs, []);
});

test('rapid preference changes leave one menu with the final selected language', async () => {
  const refresh = registerContextMenu();
  preferences.language = 'zh_CN';
  changed.emit({ preferences: { newValue: preferences } }, 'local');
  preferences.language = 'en';
  changed.emit({ preferences: { newValue: preferences } }, 'local');
  preferences.language = 'auto';
  changed.emit({ preferences: { newValue: preferences } }, 'local');
  await refresh();
  assert.equal(menu?.title, translate('contextMenuOpen', 'zh_CN'));
  assert.equal(createCalls, 1);
  assert.deepEqual(logs, []);
});

test('unrelated storage changes leave the menu untouched', async () => {
  const refresh = registerContextMenu();
  await refresh();
  const previousCalls = updateCalls;
  changed.emit({ other: { newValue: true } }, 'local');
  changed.emit({ preferences: { newValue: preferences } }, 'sync');
  await settleActions();
  assert.equal(updateCalls, previousCalls);
});

test('menu callback failures are reported and a later refresh restores the menu', async () => {
  createFailure = 'Permission unavailable';
  const refresh = registerContextMenu();
  await assert.rejects(refresh, /Permission unavailable/);
  assert.ok(logs.some((args) => args.includes('Permission unavailable')));
  assert.equal(menu, undefined);
  createFailure = undefined;
  await refresh();
  assert.equal((menu as chrome.contextMenus.CreateProperties | undefined)?.id, PAPER_LINK_MENU_ID);
});

test('a failed preference read leaves an existing menu intact and permits later refresh', async () => {
  menu = { id: PAPER_LINK_MENU_ID, title: 'Existing title', contexts: ['link'] };
  chrome.storage.local.get = async () => { throw new Error('Storage unavailable'); };
  const refresh = registerContextMenu();
  await assert.rejects(refresh, /Storage unavailable/);
  assert.equal(menu.title, 'Existing title');
  assert.equal(updateCalls, 0);
  chrome.storage.local.get = async () => ({ preferences });
  await refresh();
  assert.equal(menu.title, translate('contextMenuOpen', 'en'));
  assert.equal(createCalls, 0);
});

test('the click handler opens the clicked paper in a new tab even from a page with no URL access', async () => {
  const refresh = registerContextMenu();
  await refresh();
  preferences.format = 'pdf';
  preferences.version = 'latest';
  clicked.emit({
    menuItemId: PAPER_LINK_MENU_ID,
    editable: false,
    pageUrl: 'https://example.org/reading-list',
    linkUrl: 'https://alphaxiv.org/abs/hep-th/9901001v2?source=chat',
  }, { id: 42, index: 2, windowId: 9 } as chrome.tabs.Tab);
  await settleActions();
  assert.deepEqual(creates, [{
    url: 'https://arxiv.org/pdf/hep-th/9901001', active: true, openerTabId: 42, index: 3, windowId: 9,
  }]);
  assert.deepEqual(logs, []);
});

test('the click handler validates menu identity, link presence and the clicked URL before navigating', async () => {
  const refresh = registerContextMenu();
  await refresh();
  clicked.emit({ menuItemId: 'another-menu', editable: false, linkUrl: 'https://alphaxiv.org/abs/1706.03762' });
  clicked.emit({ menuItemId: PAPER_LINK_MENU_ID, editable: false, pageUrl: 'https://alphaxiv.org/abs/1706.03762' });
  clicked.emit({ menuItemId: PAPER_LINK_MENU_ID, editable: false, linkUrl: 'https://alphaxiv.org.evil.example/abs/1706.03762' });
  await settleActions();
  assert.deepEqual(creates, []);
  assert.equal(logs.length, 1, 'Only the rejected URL reports an action failure');
});
