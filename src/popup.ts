import { buildArxivUrl, isReadingFormat, parsePaperUrl } from './paper';
import { getPreferences, savePreferences } from './settings';

type Preferences = Awaited<ReturnType<typeof getPreferences>>;
type Paper = NonNullable<ReturnType<typeof parsePaperUrl>>;

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing popup element: ${id}`);
  return node as T;
}

const openButton = element<HTMLButtonElement>('open-paper');
const copyButton = element<HTMLButtonElement>('copy-link');
const formatFieldset = element<HTMLFieldSetElement>('format-fieldset');
const formatRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="format"]'));
const htmlNote = element<HTMLParagraphElement>('html-note');
const newTabCheckbox = element<HTMLInputElement>('new-tab');
const status = element<HTMLParagraphElement>('status');

let activeTabId: number | undefined;
let paper: Paper | null = null;
let preferences: Preferences | null = null;
let saving = false;
let opening = false;
let copying = false;
let saveQueue: Promise<void> = Promise.resolve();

function showStatus(message: string, kind: 'neutral' | 'success' | 'error' = 'neutral'): void {
  status.textContent = message;
  status.className = `status${kind === 'neutral' ? '' : ` is-${kind}`}`;
}

function renderControls(): void {
  openButton.disabled = paper === null || preferences === null || saving || opening;
  copyButton.disabled = paper === null || copying;
  formatFieldset.disabled = preferences === null || saving || opening;
  newTabCheckbox.disabled = preferences === null || saving || opening;
  element('open-label').textContent = opening ? '正在打开…' : '打开 arXiv';
  if (preferences !== null) {
    for (const radio of formatRadios) radio.checked = radio.value === preferences.format;
    newTabCheckbox.checked = preferences.openInNewTab;
  }
  htmlNote.hidden = preferences?.format !== 'html';
  renderPaper();
}

function renderPaper(): void {
  const paperId = element('paper-id');
  const source = element('paper-source');
  const note = element('paper-note');
  paperId.closest<HTMLElement>('.paper-card')!.dataset.empty = String(paper === null);
  source.dataset.ready = String(paper !== null);
  if (paper !== null) {
    paperId.textContent = paper.id;
    source.textContent = paper.source === 'alphaxiv' ? '来自 alphaXiv' : '来自 arXiv';
    note.textContent = buildArxivUrl(paper, preferences?.format ?? 'abs').replace('https://', '');
    note.title = '保留当前版本；复制链接始终使用 arXiv 摘要页地址';
  } else {
    paperId.textContent = '从一篇论文开始';
    source.textContent = '等待论文';
    note.textContent = '打开 alphaXiv 或 arXiv 的论文页面，即可跳转和复制原文链接。';
    note.removeAttribute('title');
  }
}

function updateTab(tab: chrome.tabs.Tab): void {
  activeTabId = tab.id;
  paper = parsePaperUrl(tab.pendingUrl ?? tab.url ?? '');
  renderControls();
}

async function persistPreferences(patch: Partial<Preferences>): Promise<void> {
  if (preferences === null || saving) return;
  const previous = preferences;
  preferences = { ...preferences, ...patch };
  saving = true;
  showStatus('正在保存偏好…');
  renderControls();

  const operation = saveQueue.then(() => savePreferences(patch));
  // Keep the next user action available after a storage error is reported.
  saveQueue = operation.catch(() => undefined);
  try {
    await operation;
    showStatus('偏好已保存，页面按钮和快捷键会使用此设置', 'success');
  } catch {
    preferences = previous;
    showStatus('保存失败，请重新选择阅读偏好。', 'error');
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
    } else {
      showStatus(response?.error ?? '打开失败，请刷新论文页面后重试。', 'error');
    }
  } catch {
    showStatus('打开失败，请刷新论文页面后重试。', 'error');
  } finally {
    opening = false;
    renderControls();
  }
});

copyButton.addEventListener('click', async () => {
  if (paper === null || copying) return;
  const link = buildArxivUrl(paper, 'abs');
  copying = true;
  renderControls();
  try {
    await navigator.clipboard.writeText(link);
    showStatus('已复制 arXiv 摘要页链接，论文版本已保留', 'success');
  } catch {
    showStatus('复制失败，请保持弹窗打开后重试。', 'error');
  } finally {
    copying = false;
    renderControls();
  }
});

element<HTMLButtonElement>('edit-shortcut').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close();
  } catch {
    showStatus('请在地址栏打开 chrome://extensions/shortcuts 设置快捷键。', 'error');
  }
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tabId === activeTabId) updateTab(tab);
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
    showStatus('读取偏好失败，请重新打开弹窗。', 'error');
  }

  if (tabResult.status === 'fulfilled' && tabResult.value[0] !== undefined) {
    updateTab(tabResult.value[0]);
  } else {
    showStatus('读取页面失败，请重新打开弹窗。', 'error');
  }

  const command = shortcutResult.status === 'fulfilled'
    ? shortcutResult.value.find((entry) => entry.name === 'open-arxiv')
    : undefined;
  element('shortcut').textContent = command?.shortcut || '点击设置';
  renderControls();
}

void initialize();
