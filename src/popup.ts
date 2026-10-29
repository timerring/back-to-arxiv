import { buildArxivUrl, buildMarkdownLink, getPaperId, isPaperVersion, isReadingFormat, parsePaperInput, parsePaperUrl, type ReadingFormat } from './paper';
import { isLanguagePreference, localize, resolveLocale, translate, type LanguagePreference, type MessageKey } from './i18n';
import { getPreferences, normalizePreferences, savePreferences } from './settings';

type Preferences = Awaited<ReturnType<typeof getPreferences>>;
type Paper = NonNullable<ReturnType<typeof parsePaperUrl>>;
type StatusKind = 'neutral' | 'success' | 'error';
type StatusMessage = { key: MessageKey; kind: StatusKind } | { text: string; kind: StatusKind };
type MenuName = 'open' | 'copy';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing popup element: ${id}`);
  return node as T;
}

const openButton = element<HTMLButtonElement>('open-paper');
const copyButton = element<HTMLButtonElement>('copy-link');
const paperInput = element<HTMLInputElement>('paper-input');
const currentPageButton = element<HTMLButtonElement>('use-current-page');
const formatFieldset = element<HTMLFieldSetElement>('format-fieldset');
const formatRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="format"]'));
const htmlNote = element<HTMLParagraphElement>('html-note');
const newTabCheckbox = element<HTMLInputElement>('new-tab');
const languageSelect = element<HTMLSelectElement>('language');
const versionSelect = element<HTMLSelectElement>('paper-version');
const status = element<HTMLParagraphElement>('status');
const menus = Object.fromEntries((['open', 'copy'] as const).map((name) => {
  const menu = element<HTMLDivElement>(`${name}-menu`);
  return [name, {
    container: element<HTMLDivElement>(`${name}-actions`),
    toggle: element<HTMLButtonElement>(`${name}-menu-toggle`),
    menu,
    items: Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')),
  }];
})) as Record<MenuName, { container: HTMLDivElement; toggle: HTMLButtonElement; menu: HTMLDivElement; items: HTMLButtonElement[] }>;

let activeTabId: number | undefined;
let currentPagePaper: Paper | null = null;
let paper: Paper | null = null;
let preferences: Preferences | null = null;
let saving = false;
let opening = false;
let copying = false;
let shortcut: string | undefined;
let statusMessage: StatusMessage = { key: 'storageNote', kind: 'neutral' };
let saveQueue: Promise<void> = Promise.resolve();

function language(): LanguagePreference { return preferences?.language ?? 'en'; }
function t(key: MessageKey): string { return translate(key, language()); }
function hasInput(): boolean { return paperInput.value.trim().length > 0; }
function selectPaper(): void { paper = hasInput() ? parsePaperInput(paperInput.value) : currentPagePaper; }

function renderStatus(): void {
  const visibleMessage: StatusMessage = hasInput() && paper === null
    ? { key: 'invalidPaperInput', kind: 'error' }
    : statusMessage;
  status.textContent = 'key' in visibleMessage ? t(visibleMessage.key) : visibleMessage.text;
  status.className = `status${visibleMessage.kind === 'neutral' ? '' : ` is-${visibleMessage.kind}`}`;
}

function showStatus(key: MessageKey, kind: StatusKind = 'neutral'): void {
  statusMessage = { key, kind };
  renderStatus();
}

function closeMenu(name: MenuName, restoreFocus = false): void {
  const { menu, toggle } = menus[name];
  menu.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus && toggle.disabled === false) toggle.focus();
}

function closeMenus(): void {
  closeMenu('open');
  closeMenu('copy');
}

function openMenu(name: MenuName, last = false): void {
  const { menu, toggle, items } = menus[name];
  if (toggle.disabled) return;
  closeMenus();
  menu.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  items[last ? items.length - 1 : 0]?.focus();
}

function renderControls(): void {
  selectPaper();
  localize(document, language());
  document.documentElement.lang = resolveLocale(language()).replace('_', '-');
  const unavailable = paper === null || preferences === null || saving || opening || copying;
  openButton.disabled = unavailable || (hasInput() === false && activeTabId === undefined);
  copyButton.disabled = unavailable;
  menus.open.toggle.disabled = openButton.disabled;
  menus.copy.toggle.disabled = copyButton.disabled;
  if (menus.open.toggle.disabled) closeMenu('open');
  if (menus.copy.toggle.disabled) closeMenu('copy');
  formatFieldset.disabled = preferences === null || saving || opening || copying;
  newTabCheckbox.disabled = preferences === null || saving || opening || copying || hasInput();
  languageSelect.disabled = preferences === null || saving || opening || copying;
  versionSelect.disabled = preferences === null || saving || opening || copying;
  paperInput.disabled = opening || copying;
  paperInput.placeholder = t('paperInputPlaceholder');
  paperInput.setAttribute('aria-invalid', String(hasInput() && paper === null));
  currentPageButton.hidden = paperInput.value.length === 0;
  currentPageButton.disabled = opening || copying;
  element('open-label').textContent = t(opening ? 'opening' : 'openArxiv');
  element('shortcut').textContent = shortcut || t('shortcutUnset');
  if (preferences !== null) {
    for (const radio of formatRadios) radio.checked = radio.value === preferences.format;
    newTabCheckbox.checked = hasInput() || preferences.openInNewTab;
    languageSelect.value = preferences.language;
    versionSelect.value = preferences.version;
  }
  htmlNote.hidden = preferences?.format !== 'html';
  renderPaper();
  renderStatus();
}

function renderPaper(): void {
  const paperId = element('paper-id');
  const source = element('paper-source');
  const note = element('paper-note');
  const manual = hasInput();
  paperId.closest<HTMLElement>('.paper-card')!.dataset.empty = String(paper === null);
  source.dataset.ready = String(paper !== null);
  if (paper !== null) {
    paperId.textContent = getPaperId(paper, preferences?.version ?? 'current');
    source.textContent = t(manual ? 'inputSource' : paper.source === 'alphaxiv' ? 'sourceAlphaXiv' : 'sourceArxiv');
    note.textContent = buildArxivUrl(paper, preferences?.format ?? 'abs', preferences?.version ?? 'current').replace('https://', '');
    note.title = t(preferences?.version === 'latest' ? 'latestVersionNote' : 'versionNote');
  } else {
    paperId.textContent = t(manual ? 'invalidInputHeading' : 'emptyPaper');
    source.textContent = t(manual ? 'inputSource' : 'waitingPaper');
    note.textContent = manual ? '' : t('emptyNote');
    note.removeAttribute('title');
  }
}

function updateTab(tab: chrome.tabs.Tab): void {
  const nextPaper = parsePaperUrl(tab.pendingUrl ?? tab.url ?? '');
  if (hasInput() === false && (activeTabId !== tab.id || currentPagePaper?.id !== nextPaper?.id || currentPagePaper?.source !== nextPaper?.source)) closeMenus();
  activeTabId = tab.id;
  currentPagePaper = nextPaper;
  renderControls();
}

async function persistPreferences(patch: Partial<Preferences>): Promise<void> {
  if (preferences === null || saving) return;
  const previous = preferences;
  preferences = { ...preferences, ...patch };
  saving = true;
  showStatus('savingPreferences');
  renderControls();
  const operation = saveQueue.then(() => savePreferences(patch));
  saveQueue = operation.catch(() => undefined);
  try {
    await operation;
    showStatus('savedPreferences', 'success');
  } catch {
    preferences = previous;
    showStatus('saveFailed', 'error');
  } finally {
    saving = false;
    renderControls();
  }
}

for (const radio of formatRadios) {
  radio.addEventListener('change', () => {
    if (radio.checked && isReadingFormat(radio.value)) void persistPreferences({ format: radio.value });
  });
}
newTabCheckbox.addEventListener('change', () => { void persistPreferences({ openInNewTab: newTabCheckbox.checked }); });
languageSelect.addEventListener('change', () => {
  if (isLanguagePreference(languageSelect.value)) void persistPreferences({ language: languageSelect.value });
});
versionSelect.addEventListener('change', () => {
  if (isPaperVersion(versionSelect.value)) void persistPreferences({ version: versionSelect.value });
});

function updateInput(): void {
  closeMenus();
  selectPaper();
  showStatus(hasInput() ? (paper === null ? 'invalidPaperInput' : 'inputNewTabNote') : 'storageNote', hasInput() && paper === null ? 'error' : 'neutral');
  renderControls();
}
paperInput.addEventListener('input', updateInput);
paperInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.isComposing === false) {
    event.preventDefault();
    void openPaper();
  }
});
currentPageButton.addEventListener('click', () => {
  paperInput.value = '';
  updateInput();
  paperInput.focus();
});

for (const name of ['open', 'copy'] as const) {
  const { menu, toggle, items, container } = menus[name];
  toggle.addEventListener('click', () => {
    if (menu.hidden) openMenu(name);
    else closeMenu(name, true);
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(name, event.key === 'ArrowUp');
    }
  });
  menu.addEventListener('keydown', (event) => {
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (current + items.length - 1) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Tab') { closeMenu(name); return; }
    else return;
    event.preventDefault();
    items[next]?.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.composedPath().includes(container) === false) closeMenu(name);
  });
  document.addEventListener('focusin', (event) => {
    if (event.composedPath().includes(container) === false) closeMenu(name);
  });
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const name = (['open', 'copy'] as const).find((name) => menus[name].menu.hidden === false);
  if (name) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(name, true);
  }
});

async function openPaper(format?: ReadingFormat): Promise<void> {
  selectPaper();
  if (paper === null || preferences === null || opening || copying || saving || (hasInput() === false && activeTabId === undefined)) return;
  const request = hasInput()
    ? { type: 'OPEN_INPUT_ARXIV', input: paperInput.value, ...(activeTabId === undefined ? {} : { tabId: activeTabId }), ...(format ? { format } : {}) }
    : { type: 'OPEN_ARXIV', tabId: activeTabId, ...(format ? { format } : {}) };
  closeMenus();
  opening = true;
  renderControls();
  try {
    await saveQueue;
    const response: { ok?: boolean; error?: string } | undefined = await chrome.runtime.sendMessage(request);
    if (response?.ok === true) window.close();
    else if (response?.error) statusMessage = { text: response.error, kind: 'error' };
    else showStatus('openFailed', 'error');
  } catch {
    showStatus('openFailed', 'error');
  } finally {
    opening = false;
    renderControls();
  }
}
openButton.addEventListener('click', () => { void openPaper(); });
for (const item of menus.open.items) {
  item.addEventListener('click', () => {
    if (isReadingFormat(item.dataset.openFormat)) void openPaper(item.dataset.openFormat);
  });
}

async function copyLink(format: ReadingFormat | 'markdown'): Promise<void> {
  selectPaper();
  if (paper === null || preferences === null || copying || saving || opening) return;
  const text = format === 'markdown' ? buildMarkdownLink(paper, preferences.version) : buildArxivUrl(paper, format, preferences.version);
  const fromMenu = menus.copy.menu.hidden === false;
  closeMenus();
  copying = true;
  renderControls();
  try {
    await navigator.clipboard.writeText(text);
    showStatus('copySucceeded', 'success');
  } catch {
    showStatus('copyFailed', 'error');
  } finally {
    copying = false;
    renderControls();
    if (fromMenu && (document.activeElement === document.body || menus.copy.menu.contains(document.activeElement))) menus.copy.toggle.focus();
  }
}
copyButton.addEventListener('click', () => { void copyLink('abs'); });
for (const item of menus.copy.items) {
  item.addEventListener('click', () => {
    const format = item.dataset.copyFormat;
    if (isReadingFormat(format) || format === 'markdown') void copyLink(format);
  });
}

element<HTMLButtonElement>('edit-shortcut').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
  } catch { showStatus('shortcutInstructions', 'error'); }
});
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tabId === activeTabId) updateTab(tab);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.preferences && saving === false) {
    preferences = normalizePreferences(changes.preferences.newValue);
    closeMenus();
    renderControls();
  }
});

async function initialize(): Promise<void> {
  const [preferenceResult, tabResult, shortcutResult] = await Promise.allSettled([
    getPreferences(), chrome.tabs.query({ active: true, currentWindow: true }), chrome.commands.getAll(),
  ]);
  if (preferenceResult.status === 'fulfilled') preferences = preferenceResult.value;
  else showStatus('loadPreferencesFailed', 'error');
  if (tabResult.status === 'fulfilled' && tabResult.value[0] !== undefined) updateTab(tabResult.value[0]);
  else if (hasInput() === false) showStatus('loadPageFailed', 'error');
  shortcut = shortcutResult.status === 'fulfilled' ? shortcutResult.value.find((entry) => entry.name === 'open-arxiv')?.shortcut : undefined;
  renderControls();
}
void initialize();
