import { analyzeBatch, buildBatchMarkdown, MAX_BATCH_CHARACTERS, MAX_BATCH_REFERENCES, type BatchEntry } from './batch';
import { buildArxivUrl, isPaperVersion, type PaperVersion } from './paper';
import { localize, resolveLocale, translate, type LanguagePreference, type MessageKey } from './i18n';
import { DEFAULT_PREFERENCES, getPreferences, normalizePreferences } from './settings';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing batch element: ${id}`);
  return node as T;
}

const input = element<HTMLTextAreaElement>('batch-input');
const versionSelect = element<HTMLSelectElement>('batch-version');
const copyButton = element<HTMLButtonElement>('batch-copy');
const downloadButton = element<HTMLButtonElement>('batch-download');
const clearButton = element<HTMLButtonElement>('batch-clear');
const resultList = element<HTMLOListElement>('batch-results');
const markdownPreview = element<HTMLTextAreaElement>('batch-markdown');
const status = element<HTMLParagraphElement>('batch-status');

let language: LanguagePreference = DEFAULT_PREFERENCES.language;
let version: PaperVersion = DEFAULT_PREFERENCES.version;
let versionChosen = false;
let preferenceRevision = 0;
let initialized = false;
let copying = false;
let loadFailed = false;
let feedback: { key: MessageKey; kind: 'success' | 'error' } | null = null;
let result = analyzeBatch('', version);

function t(key: MessageKey, substitutions: string[] = []): string { return translate(key, language, substitutions); }

function rowFor(entry: BatchEntry): HTMLLIElement {
  const row = document.createElement('li');
  row.dataset.status = entry.status;
  row.dataset.line = String(entry.lineNumber);
  const meta = document.createElement('div');
  meta.className = 'result-meta';
  const line = document.createElement('span');
  line.className = 'line-number';
  line.textContent = t('batchLineNumber', [String(entry.lineNumber)]);
  const badge = document.createElement('span');
  badge.className = 'result-badge';
  badge.textContent = t(entry.status === 'valid' ? 'batchValidBadge' : entry.status === 'duplicate' ? 'batchDuplicateBadge' : 'batchInvalidBadge');
  meta.append(line, badge);
  row.append(meta);
  if (entry.status !== 'invalid') {
    const link = document.createElement('a');
    link.className = 'paper-link';
    link.href = buildArxivUrl(entry.paper, 'abs', version);
    link.textContent = `arXiv:${entry.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    row.append(link);
  }
  const raw = document.createElement('code');
  raw.className = 'raw-input';
  raw.textContent = entry.input;
  row.append(raw);
  const detail = document.createElement('p');
  detail.className = 'result-detail';
  detail.textContent = entry.status === 'invalid'
    ? t('batchInvalidDetail')
    : entry.status === 'duplicate'
      ? t('batchDuplicateDetail', [String(entry.duplicateOf)])
      : buildArxivUrl(entry.paper, 'abs', version);
  row.append(detail);
  return row;
}

function render(): void {
  localize(document, language);
  document.documentElement.lang = resolveLocale(language).replace('_', '-');
  input.placeholder = t('batchInputPlaceholder');
  versionSelect.value = version;
  versionSelect.disabled = initialized === false;
  element('batch-limits').textContent = t('batchLimits', [String(MAX_BATCH_REFERENCES), String(MAX_BATCH_CHARACTERS)]);
  element('batch-version-note').textContent = t(version === 'current' ? 'batchCurrentNote' : 'batchLatestNote');
  element('batch-unique-count').textContent = String(result.papers.length);
  element('batch-duplicate-count').textContent = String(result.duplicateCount);
  element('batch-invalid-count').textContent = String(result.invalidCount);
  const markdown = buildBatchMarkdown(result);
  markdownPreview.value = markdown;
  const hasExport = initialized && markdown.length > 0 && result.error === null;
  copyButton.disabled = hasExport === false;
  copyButton.setAttribute('aria-busy', String(copying));
  downloadButton.disabled = hasExport === false;
  clearButton.disabled = input.value.length === 0;
  element<HTMLButtonElement>('batch-example').disabled = input.value.length > 0;
  input.setAttribute('aria-invalid', String(result.error !== null || result.invalidCount > 0));
  resultList.replaceChildren(...result.entries.map(rowFor));
  element('batch-empty').hidden = result.entries.length > 0 || result.error !== null;
  element('batch-preview').hidden = hasExport === false;
  let message = '';
  let kind = '';
  if (result.error !== null) {
    message = t(result.error === 'inputTooLong' ? 'batchInputTooLong' : 'batchTooManyReferences', [String(result.error === 'inputTooLong' ? MAX_BATCH_CHARACTERS : MAX_BATCH_REFERENCES)]);
    kind = 'error';
  } else if (feedback !== null) {
    message = t(feedback.key);
    kind = feedback.kind;
  } else if (loadFailed) {
    message = t('batchLoadFailed');
    kind = 'error';
  } else if (result.invalidCount > 0) {
    message = t('batchHasInvalid');
  } else if (hasExport) {
    message = t('batchReady', [String(result.papers.length)]);
  }
  status.textContent = message;
  status.className = `status${kind ? ` is-${kind}` : ''}`;
}

function analyzeInput(): void {
  feedback = null;
  result = analyzeBatch(input.value, version);
  render();
}

input.addEventListener('input', analyzeInput);
versionSelect.addEventListener('change', () => {
  if (isPaperVersion(versionSelect.value) === false) return;
  version = versionSelect.value;
  versionChosen = true;
  analyzeInput();
});
clearButton.addEventListener('click', () => {
  input.value = '';
  analyzeInput();
  input.focus();
});
element<HTMLButtonElement>('batch-example').addEventListener('click', () => {
  input.value = [
    'https://www.alphaxiv.org/abs/1706.03762v3?source=share',
    '- [Attention Is All You Need](https://arxiv.org/pdf/1706.03762v3)',
    'doi:10.48550/arXiv.2301.12345',
    'hep-th/9901001v2',
    t('batchExampleInvalid'),
  ].join('\n');
  analyzeInput();
  input.focus();
});
copyButton.addEventListener('click', () => {
  if (copyButton.disabled || copying) return;
  const markdown = buildBatchMarkdown(result);
  const copiedInput = input.value;
  const copiedVersion = version;
  copying = true;
  feedback = null;
  render();
  void (async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      if (input.value === copiedInput && version === copiedVersion) feedback = { key: 'batchCopied', kind: 'success' };
    } catch {
      if (input.value === copiedInput && version === copiedVersion) feedback = { key: 'batchCopyFailed', kind: 'error' };
    } finally {
      copying = false;
      render();
    }
  })();
});
downloadButton.addEventListener('click', () => {
  if (downloadButton.disabled) return;
  let url: string | undefined;
  const link = document.createElement('a');
  try {
    const markdown = buildBatchMarkdown(result);
    url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    link.href = url;
    link.download = 'back-to-arxiv-reading-list.md';
    link.hidden = true;
    document.body.append(link);
    link.click();
    feedback = { key: 'batchDownloaded', kind: 'success' };
  } catch {
    feedback = { key: 'batchDownloadFailed', kind: 'error' };
  } finally {
    link.remove();
    // Allow the browser to start reading the Blob before releasing its URL.
    if (url !== undefined) setTimeout(() => URL.revokeObjectURL(url!), 1000);
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || changes.preferences === undefined) return;
  preferenceRevision++;
  language = normalizePreferences(changes.preferences.newValue).language;
  render();
});

async function initialize(): Promise<void> {
  const revision = preferenceRevision;
  try {
    const preferences = await getPreferences();
    if (revision === preferenceRevision) language = preferences.language;
    if (versionChosen === false) version = preferences.version;
  } catch {
    loadFailed = true;
  }
  initialized = true;
  result = analyzeBatch(input.value, version);
  render();
}

render();
void initialize();
