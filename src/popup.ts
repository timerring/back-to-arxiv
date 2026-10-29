import { buildArxivUrl, getPaperId, isPaperVersion, isReadingFormat, parsePaperUrl, type ReadingFormat } from './paper';
import { isLanguagePreference, localize, resolveLocale, translate, type LanguagePreference, type MessageKey } from './i18n';
import { getPreferences, normalizePreferences, savePreferences } from './settings';

type Preferences = Awaited<ReturnType<typeof getPreferences>>;
type Paper = NonNullable<ReturnType<typeof parsePaperUrl>>;
type StatusKind = 'neutral' | 'success' | 'error';
type StatusMessage = { key: MessageKey; kind: StatusKind } | { text: string; kind: StatusKind };

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing popup element: ${id}`);
  return node as T;
}

const openButton = element<HTMLButtonElement>('open-paper');
const copyButton = element<HTMLButtonElement>('copy-link');
const copyActions = element<HTMLDivElement>('copy-actions');
const copyMenuToggle = element<HTMLButtonElement>('copy-menu-toggle');
const copyMenu = element<HTMLDivElement>('copy-menu');
const copyMenuItems = Array.from(copyMenu.querySelectorAll<HTMLButtonElement>('[data-copy-format]'));
const formatFieldset = element<HTMLFieldSetElement>('format-fieldset');
const formatRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="format"]'));
const htmlNote = element<HTMLParagraphElement>('html-note');
const newTabCheckbox = element<HTMLInputElement>('new-tab');
const languageSelect = element<HTMLSelectElement>('language');
const versionSelect = element<HTMLSelectElement>('paper-version');
const status = element<HTMLParagraphElement>('status');

let activeTabId: number | undefined;
let paper: Paper | null = null;
let preferences: Preferences | null = null;
let saving = false;
let opening = false;
let copying = false;
let shortcut: string | undefined;
let statusMessage: StatusMessage = { key: 'storageNote', kind: 'neutral' };
let saveQueue: Promise<void> = Promise.resolve();

function language(): LanguagePreference {
  return preferences?.language ?? 'en';
}

function t(key: MessageKey): string {
  return translate(key, language());
}

function renderStatus(): void {
  status.textContent = 'key' in statusMessage ? t(statusMessage.key) : statusMessage.text;
  status.className = `status${statusMessage.kind === 'neutral' ? '' : ` is-${statusMessage.kind}`}`;
}

function showStatus(key: MessageKey, kind: StatusKind = 'neutral'): void {
  statusMessage = { key, kind };
  renderStatus();
}

function renderControls(): void {
  localize(document, language());
  document.documentElement.lang = resolveLocale(language()).replace('_', '-');
  openButton.disabled = paper === null || preferences === null || saving || opening;
  copyButton.disabled = paper === null || preferences === null || saving || opening || copying;
  copyMenuToggle.disabled = copyButton.disabled;
  if (copyMenuToggle.disabled) closeCopyMenu();
  formatFieldset.disabled = preferences === null || saving || opening;
  newTabCheckbox.disabled = preferences === null || saving || opening;
  languageSelect.disabled = preferences === null || saving || opening;
  versionSelect.disabled = preferences === null || saving || opening;
  element('open-label').textContent = t(opening ? 'opening' : 'openArxiv');
  element('shortcut').textContent = shortcut || t('shortcutUnset');
  if (preferences !== null) {
    for (const radio of formatRadios) radio.checked = radio.value === preferences.format;
    newTabCheckbox.checked = preferences.openInNewTab;
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
  paperId.closest<HTMLElement>('.paper-card')!.dataset.empty = String(paper === null);
  source.dataset.ready = String(paper !== null);
  if (paper !== null) {
    paperId.textContent = getPaperId(paper, preferences?.version ?? 'current');
    source.textContent = t(paper.source === 'alphaxiv' ? 'sourceAlphaXiv' : 'sourceArxiv');
    note.textContent = buildArxivUrl(paper, preferences?.format ?? 'abs', preferences?.version ?? 'current').replace('https://', '');
    note.title = t(preferences?.version === 'latest' ? 'latestVersionNote' : 'versionNote');
  } else {
    paperId.textContent = t('emptyPaper');
    source.textContent = t('waitingPaper');
    note.textContent = t('emptyNote');
    note.removeAttribute('title');
  }
}

function updateTab(tab: chrome.tabs.Tab): void {
  const nextPaper = parsePaperUrl(tab.pendingUrl ?? tab.url ?? '');
  if (activeTabId !== tab.id || paper?.id !== nextPaper?.id || paper?.source !== nextPaper?.source) closeCopyMenu();
  activeTabId = tab.id;
  paper = nextPaper;
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
  // Keep the next user action available after a storage error is reported.
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
    if (radio.checked && isReadingFormat(radio.value)) {
      void persistPreferences({ format: radio.value });
    }
  });
}
newTabCheckbox.addEventListener('change', () => {
  void persistPreferences({ openInNewTab: newTabCheckbox.checked });
});
languageSelect.addEventListener('change', () => {
  if (isLanguagePreference(languageSelect.value)) {
    void persistPreferences({ language: languageSelect.value });
  }
});
versionSelect.addEventListener('change', () => {
  if (isPaperVersion(versionSelect.value)) {
    void persistPreferences({ version: versionSelect.value });
  }
});

function closeCopyMenu(restoreFocus = false): void {
  copyMenu.hidden = true;
  copyMenuToggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus && copyMenuToggle.disabled === false) copyMenuToggle.focus();
}

function openCopyMenu(last = false): void {
  if (copyMenuToggle.disabled) return;
  copyMenu.hidden = false;
  copyMenuToggle.setAttribute('aria-expanded', 'true');
  copyMenuItems[last ? copyMenuItems.length - 1 : 0]?.focus();
}

copyMenuToggle.addEventListener('click', () => {
  if (copyMenu.hidden) openCopyMenu();
  else closeCopyMenu(true);
});
copyMenuToggle.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    openCopyMenu(event.key === 'ArrowUp');
  }
});
copyMenu.addEventListener('keydown', (event) => {
  const current = copyMenuItems.indexOf(document.activeElement as HTMLButtonElement);
  let next: number;
  if (event.key === 'ArrowDown') next = (current + 1) % copyMenuItems.length;
  else if (event.key === 'ArrowUp') next = (current + copyMenuItems.length - 1) % copyMenuItems.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = copyMenuItems.length - 1;
  else if (event.key === 'Tab') { closeCopyMenu(); return; }
  else return;
  event.preventDefault();
  copyMenuItems[next]?.focus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && copyMenu.hidden === false) {
    event.preventDefault();
    event.stopPropagation();
    closeCopyMenu(true);
  }
});
document.addEventListener('pointerdown', (event) => {
  if (event.composedPath().includes(copyActions) === false) closeCopyMenu();
});
document.addEventListener('focusin', (event) => {
  if (event.composedPath().includes(copyActions) === false) closeCopyMenu();
});

openButton.addEventListener('click', async () => {
  if (paper === null || activeTabId === undefined || opening || saving) return;
  opening = true;
  renderControls();
  try {
    await saveQueue;
    const response: { ok?: boolean; error?: string } | undefined = await chrome.runtime.sendMessage({
      type: 'OPEN_ARXIV',
      tabId: activeTabId,
    });
    if (response?.ok === true) {
      window.close();
    } else if (response?.error) {
      statusMessage = { text: response.error, kind: 'error' };
    } else {
      showStatus('openFailed', 'error');
    }
  } catch {
    showStatus('openFailed', 'error');
  } finally {
    opening = false;
    renderControls();
  }
});

async function copyLink(format: ReadingFormat): Promise<void> {
  if (paper === null || preferences === null || copying || saving || opening) return;
  const link = buildArxivUrl(paper, format, preferences.version);
  const fromMenu = copyMenu.hidden === false;
  closeCopyMenu();
  copying = true;
  renderControls();
  try {
    await navigator.clipboard.writeText(link);
    showStatus('copySucceeded', 'success');
  } catch {
    showStatus('copyFailed', 'error');
  } finally {
    copying = false;
    renderControls();
    if (fromMenu && (document.activeElement === document.body || copyMenu.contains(document.activeElement))) {
      copyMenuToggle.focus();
    }
  }
}

copyButton.addEventListener('click', () => { void copyLink('abs'); });
for (const item of copyMenuItems) {
  item.addEventListener('click', () => {
    if (isReadingFormat(item.dataset.copyFormat)) void copyLink(item.dataset.copyFormat);
  });
}

element<HTMLButtonElement>('edit-shortcut').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
  } catch {
    showStatus('shortcutInstructions', 'error');
  }
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tabId === activeTabId) updateTab(tab);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.preferences && saving === false) {
    preferences = normalizePreferences(changes.preferences.newValue);
    renderControls();
  }
});

async function initialize(): Promise<void> {
  const [preferenceResult, tabResult, shortcutResult] = await Promise.allSettled([
    getPreferences(),
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.commands.getAll(),
  ]);

  if (preferenceResult.status === 'fulfilled') {
    preferences = preferenceResult.value;
  } else {
    showStatus('loadPreferencesFailed', 'error');
  }

  if (tabResult.status === 'fulfilled' && tabResult.value[0] !== undefined) {
    updateTab(tabResult.value[0]);
  } else {
    showStatus('loadPageFailed', 'error');
  }

  shortcut = shortcutResult.status === 'fulfilled'
    ? shortcutResult.value.find((entry) => entry.name === 'open-arxiv')?.shortcut
    : undefined;
  renderControls();
}

void initialize();
