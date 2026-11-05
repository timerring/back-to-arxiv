import { analyzeBatch, MAX_BATCH_CHARACTERS, MAX_BATCH_REFERENCES, type BatchEntry } from './batch';
import { buildBatchBibtex, buildCitationMarkdown, citationForId, parseArxivFeed, type CitationMetadata } from './citations';
import { METADATA_ORIGIN, MAX_METADATA_IDS, type MetadataResponse } from './metadata-protocol';
import { buildArxivUrl, getPaperId, isPaperVersion, type PaperVersion } from './paper';
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
const fetchButton = element<HTMLButtonElement>('batch-fetch-metadata');
const cancelFetchButton = element<HTMLButtonElement>('batch-cancel-metadata');
const useTitles = element<HTMLInputElement>('batch-use-titles');
const bibtexCopyButton = element<HTMLButtonElement>('batch-bibtex-copy');
const bibtexDownloadButton = element<HTMLButtonElement>('batch-bibtex-download');
const resultList = element<HTMLOListElement>('batch-results');
const markdownPreview = element<HTMLTextAreaElement>('batch-markdown');
const bibtexPreview = element<HTMLTextAreaElement>('batch-bibtex');
const status = element<HTMLParagraphElement>('batch-status');
const metadataStatus = element<HTMLParagraphElement>('batch-metadata-status');

type Feedback = { key: MessageKey; kind: 'success' | 'error' | 'neutral' };
let language: LanguagePreference = DEFAULT_PREFERENCES.language;
let version: PaperVersion = DEFAULT_PREFERENCES.version;
let versionChosen = false;
let preferenceRevision = 0;
let initialized = false;
let copying = false;
let copyingBibtex = false;
let loadFailed = false;
let feedback: Feedback | null = null;
let metadataFeedback: Feedback | null = null;
let result = analyzeBatch('', version);
const metadata = new Map<string, CitationMetadata>();
const failedMetadata = new Set<string>();
const pendingMetadata = new Set<string>();
let fetching = false;
let awaitingPermission = false;
let fetchGeneration = 0;
let activeRequestId: string | undefined;
let fetchProcessed = 0;
let fetchTotal = 0;
let exportRevision = 0;

function t(key: MessageKey, substitutions: string[] = []): string { return translate(key, language, substitutions); }
function selectedIds(): string[] { return result.papers.map((paper) => getPaperId(paper, version)); }
function currentMarkdown(): string { return buildCitationMarkdown(result, metadata, useTitles.checked); }
function currentBibtex(): string { return buildBatchBibtex(result, metadata); }

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
    const citation = citationForId(entry.id, metadata);
    row.dataset.metadata = citation ? 'ready' : pendingMetadata.has(entry.id) ? 'pending' : failedMetadata.has(entry.id) ? 'failed' : 'idle';
    const link = document.createElement('a');
    link.className = `paper-link${citation ? ' paper-title' : ''}`;
    link.href = buildArxivUrl(entry.paper, 'abs', version);
    link.textContent = citation?.title ?? `arXiv:${entry.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    row.append(link);
    if (citation) {
      const identifier = document.createElement('p');
      identifier.className = 'paper-identifier';
      identifier.textContent = `arXiv:${entry.id}`;
      const authors = document.createElement('p');
      authors.className = 'paper-authors';
      authors.textContent = citation.authors.join('; ');
      authors.setAttribute('aria-label', t('batchAuthors'));
      if (authors.textContent.length > 250) authors.tabIndex = 0;
      row.append(identifier, authors);
    }
    const state = document.createElement('p');
    state.className = 'citation-state';
    state.textContent = t(citation ? 'batchMetadataFetched' : pendingMetadata.has(entry.id) ? 'batchMetadataPending'
      : failedMetadata.has(entry.id) ? 'batchMetadataMissing' : 'batchMetadataNotFetched');
    row.append(state);
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
  const ids = selectedIds();
  const ready = ids.filter((id) => citationForId(id, metadata) !== undefined).length;
  const markdown = currentMarkdown();
  const bibtex = currentBibtex();
  markdownPreview.value = markdown;
  bibtexPreview.value = bibtex;
  const hasExport = initialized && markdown.length > 0 && result.error === null;
  copyButton.disabled = hasExport === false;
  copyButton.setAttribute('aria-busy', String(copying));
  downloadButton.disabled = hasExport === false;
  clearButton.disabled = input.value.length === 0;
  element<HTMLButtonElement>('batch-example').disabled = input.value.length > 0;
  fetchButton.disabled = initialized === false || result.error !== null || ids.length === 0 || ready === ids.length || fetching;
  fetchButton.textContent = t(failedMetadata.size > 0 || ready > 0 ? 'batchMetadataRetry' : 'batchMetadataFetch');
  fetchButton.setAttribute('aria-busy', String(fetching));
  cancelFetchButton.hidden = fetching === false;
  useTitles.disabled = initialized === false || ready === 0;
  bibtexCopyButton.disabled = initialized === false || bibtex.length === 0;
  bibtexCopyButton.setAttribute('aria-busy', String(copyingBibtex));
  bibtexDownloadButton.disabled = initialized === false || bibtex.length === 0;
  element('batch-metadata-count').textContent = String(ready);
  element('batch-metadata-total').textContent = String(ids.length);
  element('batch-bibtex-note').textContent = t('batchBibtexNote', [String(ready), String(ids.length)]);
  element('batch-bibtex-actions').hidden = ready === 0;
  element('batch-bibtex-note').hidden = ready === 0;
  element('batch-bibtex-preview').hidden = bibtex.length === 0;
  input.setAttribute('aria-invalid', String(result.error !== null || result.invalidCount > 0));
  const scrollTop = resultList.scrollTop;
  resultList.replaceChildren(...result.entries.map(rowFor));
  resultList.scrollTop = scrollTop;
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
  status.className = `status${kind && kind !== 'neutral' ? ` is-${kind}` : ''}`;
  const metadataMessage = fetching
    ? t(awaitingPermission ? 'batchMetadataAwaitingPermission' : 'batchMetadataProgress', [String(fetchProcessed), String(fetchTotal)])
    : metadataFeedback ? t(metadataFeedback.key)
      : ready > 0 ? t(ready === ids.length ? 'batchMetadataReady' : 'batchMetadataPartial') : '';
  metadataStatus.textContent = metadataMessage;
  metadataStatus.hidden = metadataMessage.length === 0;
  metadataStatus.className = `metadata-status${metadataFeedback?.kind === 'error' && fetching === false ? ' is-error' : ''}`;
  metadataStatus.dataset.state = fetching ? 'loading' : metadataFeedback?.kind === 'error' ? 'error' : ready > 0 ? 'ready' : 'idle';
}

function cancelMetadata(showFeedback = true): void {
  const hadFetch = fetching;
  fetchGeneration++;
  fetching = false;
  awaitingPermission = false;
  pendingMetadata.clear();
  if (activeRequestId !== undefined) {
    void chrome.runtime.sendMessage({ type: 'CANCEL_CITATION_METADATA', requestId: activeRequestId }).catch(() => undefined);
    activeRequestId = undefined;
  }
  if (hadFetch && showFeedback) metadataFeedback = { key: 'batchMetadataCancelled', kind: 'neutral' };
}

function analyzeInput(): void {
  cancelMetadata(false);
  feedback = null;
  metadataFeedback = null;
  result = analyzeBatch(input.value, version);
  const wanted = new Set(selectedIds());
  for (const id of metadata.keys()) if (wanted.has(id) === false) metadata.delete(id);
  for (const id of failedMetadata) if (wanted.has(id) === false) failedMetadata.delete(id);
  exportRevision++;
  render();
}

function metadataErrorKey(error: string): MessageKey {
  if (error === 'permissionDenied') return 'batchMetadataPermissionDenied';
  if (error === 'timeout') return 'batchMetadataTimeout';
  if (error === 'busy') return 'batchMetadataBusy';
  if (error === 'cancelled') return 'batchMetadataCancelled';
  if (error === 'invalidRequest' || error === 'tooLarge') return 'batchMetadataInvalidResponse';
  return 'batchMetadataNetworkFailed';
}

async function fetchMetadata(generation: number, ids: string[], permission: Promise<boolean>): Promise<void> {
  try {
    const granted = await permission;
    if (generation !== fetchGeneration) return;
    awaitingPermission = false;
    if (granted === false) {
      for (const id of ids) failedMetadata.add(id);
      metadataFeedback = { key: 'batchMetadataPermissionDenied', kind: 'error' };
      return;
    }
    for (let start = 0; start < ids.length; start += MAX_METADATA_IDS) {
      if (generation !== fetchGeneration) return;
      const chunk = ids.slice(start, start + MAX_METADATA_IDS);
      activeRequestId = crypto.randomUUID();
      render();
      let response: MetadataResponse | undefined;
      try {
        response = await chrome.runtime.sendMessage({ type: 'FETCH_CITATION_METADATA', requestId: activeRequestId, ids: chunk });
      } catch {
        response = { ok: false, error: 'network' };
      }
      if (generation !== fetchGeneration) return;
      activeRequestId = undefined;
      if (response?.ok !== true) {
        for (const id of ids.slice(start)) failedMetadata.add(id);
        metadataFeedback = { key: metadataErrorKey(response?.error ?? 'network'), kind: response?.error === 'cancelled' ? 'neutral' : 'error' };
        return;
      }
      let citations: Map<string, CitationMetadata>;
      try {
        citations = parseArxivFeed(response.xml, chunk);
      } catch {
        for (const id of ids.slice(start)) failedMetadata.add(id);
        metadataFeedback = { key: 'batchMetadataInvalidResponse', kind: 'error' };
        return;
      }
      for (const id of chunk) {
        const citation = citationForId(id, citations);
        if (citation) {
          metadata.set(id, citation);
          failedMetadata.delete(id);
        } else failedMetadata.add(id);
        pendingMetadata.delete(id);
      }
      fetchProcessed += chunk.length;
      exportRevision++;
      feedback = null;
      render();
    }
    const missing = selectedIds().filter((id) => citationForId(id, metadata) === undefined).length;
    metadataFeedback = missing > 0 ? { key: 'batchMetadataPartial', kind: metadata.size === 0 ? 'error' : 'neutral' } : null;
  } catch {
    if (generation !== fetchGeneration) return;
    for (const id of ids) if (citationForId(id, metadata) === undefined) failedMetadata.add(id);
    metadataFeedback = { key: awaitingPermission ? 'batchMetadataPermissionDenied' : 'batchMetadataNetworkFailed', kind: 'error' };
  } finally {
    if (generation === fetchGeneration) {
      const restoreFocus = document.activeElement === cancelFetchButton;
      fetching = false;
      awaitingPermission = false;
      activeRequestId = undefined;
      pendingMetadata.clear();
      render();
      if (restoreFocus && document.activeElement === document.body) (fetchButton.disabled ? copyButton : fetchButton).focus();
    }
  }
}

fetchButton.addEventListener('click', () => {
  if (fetchButton.disabled || fetching) return;
  const moveFocus = document.activeElement === fetchButton;
  const ids = selectedIds().filter((id) => citationForId(id, metadata) === undefined);
  const generation = ++fetchGeneration;
  fetching = true;
  awaitingPermission = true;
  fetchProcessed = 0;
  fetchTotal = ids.length;
  metadataFeedback = null;
  for (const id of ids) pendingMetadata.add(id);
  // Request optional access directly in the click gesture, before any asynchronous work.
  let permission: Promise<boolean>;
  try {
    permission = chrome.permissions.request({ origins: [METADATA_ORIGIN] });
  } catch {
    permission = Promise.reject(new Error('Permission request unavailable'));
  }
  render();
  if (moveFocus && (document.activeElement === document.body || document.activeElement === fetchButton)) cancelFetchButton.focus();
  void fetchMetadata(generation, ids, permission);
});
cancelFetchButton.addEventListener('click', () => {
  const restoreFocus = document.activeElement === cancelFetchButton;
  cancelMetadata();
  render();
  if (restoreFocus && document.activeElement === document.body) (fetchButton.disabled ? copyButton : fetchButton).focus();
});
window.addEventListener('pagehide', () => { cancelMetadata(false); });
input.addEventListener('input', analyzeInput);
versionSelect.addEventListener('change', () => {
  if (isPaperVersion(versionSelect.value) === false) return;
  version = versionSelect.value;
  versionChosen = true;
  analyzeInput();
});
useTitles.addEventListener('change', () => { exportRevision++; feedback = null; render(); });
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

function copyExport(kind: 'markdown' | 'bibtex'): void {
  const button = kind === 'markdown' ? copyButton : bibtexCopyButton;
  if (button.disabled || copying || copyingBibtex) return;
  const text = kind === 'markdown' ? currentMarkdown() : currentBibtex();
  const revision = exportRevision;
  if (kind === 'markdown') copying = true;
  else copyingBibtex = true;
  feedback = null;
  render();
  void (async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (revision === exportRevision) feedback = { key: kind === 'markdown' ? 'batchCopied' : 'batchBibtexCopied', kind: 'success' };
    } catch {
      if (revision === exportRevision) feedback = { key: kind === 'markdown' ? 'batchCopyFailed' : 'batchBibtexCopyFailed', kind: 'error' };
    } finally {
      if (kind === 'markdown') copying = false;
      else copyingBibtex = false;
      render();
    }
  })();
}
copyButton.addEventListener('click', () => { copyExport('markdown'); });
bibtexCopyButton.addEventListener('click', () => { copyExport('bibtex'); });

function downloadExport(kind: 'markdown' | 'bibtex'): void {
  const button = kind === 'markdown' ? downloadButton : bibtexDownloadButton;
  if (button.disabled) return;
  let url: string | undefined;
  const link = document.createElement('a');
  try {
    const text = kind === 'markdown' ? currentMarkdown() : currentBibtex();
    url = URL.createObjectURL(new Blob([text], { type: kind === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/x-bibtex;charset=utf-8' }));
    link.href = url;
    link.download = `back-to-arxiv-reading-list.${kind === 'markdown' ? 'md' : 'bib'}`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    feedback = { key: kind === 'markdown' ? 'batchDownloaded' : 'batchBibtexDownloaded', kind: 'success' };
  } catch {
    feedback = { key: kind === 'markdown' ? 'batchDownloadFailed' : 'batchBibtexDownloadFailed', kind: 'error' };
  } finally {
    link.remove();
    if (url !== undefined) setTimeout(() => URL.revokeObjectURL(url!), 1000);
    render();
  }
}
downloadButton.addEventListener('click', () => { downloadExport('markdown'); });
bibtexDownloadButton.addEventListener('click', () => { downloadExport('bibtex'); });

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
