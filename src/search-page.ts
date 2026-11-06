import { formatLabel, localize, resolveLocale, translate, type MessageKey } from './i18n';
import { METADATA_ORIGIN, type MetadataError, type MetadataResponse } from './metadata-protocol';
import { buildArxivUrl, getPaperId, READING_FORMATS, type Paper } from './paper';
import { MAX_SEARCH_START, SEARCH_PAGE_SIZE, normalizeSearchQuery, parseArxivSearchFeed, readSearchLaunch, type ArxivSearchFeed } from './search';
import { DEFAULT_PREFERENCES, getPreferences, normalizePreferences } from './settings';

const launch = readSearchLaunch(location.hash);
if (location.hash) history.replaceState(null, '', location.pathname);
const form = document.querySelector<HTMLFormElement>('#search-form')!;
const input = document.querySelector<HTMLInputElement>('#search-input')!;
const submit = document.querySelector<HTMLButtonElement>('#search-submit')!;
const cancel = document.querySelector<HTMLButtonElement>('#search-cancel')!;
const status = document.querySelector<HTMLElement>('#search-status')!;
const results = document.querySelector<HTMLOListElement>('#search-results')!;
const prev = document.querySelector<HTMLButtonElement>('#search-prev')!;
const next = document.querySelector<HTMLButtonElement>('#search-next')!;
const origin = { origins: [METADATA_ORIGIN] };
const errorMessages: Record<MetadataError, MessageKey> = {
  permissionDenied: 'searchPermissionDenied', timeout: 'searchTimeout', busy: 'searchBusy',
  network: 'searchNetworkFailed', http: 'searchNetworkFailed', invalidRequest: 'searchInvalidQuery',
  tooLarge: 'searchInvalidResponse', cancelled: 'searchCancelled',
};

let preferences = { ...DEFAULT_PREFERENCES };
let feed: ArxivSearchFeed | null = null;
let message: MessageKey = 'searchIdle';
let isError = false;
let generation = 0;
let activeId: string | null = null;
let busy = false;
let ready = false;

function renderControls(): void {
  input.disabled = !ready;
  const valid = normalizeSearchQuery(input.value) !== null;
  input.setAttribute('aria-invalid', String(input.value.trim() !== '' && !valid));
  submit.disabled = !ready || !valid || busy;
  cancel.hidden = !busy;
  status.textContent = translate(message, preferences.language);
  status.classList.toggle('is-error', isError);
  results.setAttribute('aria-busy', String(busy));
  prev.disabled = busy || !feed || feed.startIndex === 0;
  next.disabled = busy || !feed || feed.startIndex >= MAX_SEARCH_START || feed.startIndex + SEARCH_PAGE_SIZE >= feed.totalResults;
}

function setStatus(key: MessageKey, error = false): void {
  message = key;
  isError = error;
  renderControls();
}

function renderResults(): void {
  const language = preferences.language;
  const panel = document.querySelector<HTMLElement>('#results-panel')!;
  results.replaceChildren();
  panel.hidden = !feed;
  if (!feed) return;
  for (const item of feed.papers) {
    const paper: Paper = { source: 'arxiv', id: item.id };
    const row = document.createElement('li');
    row.dataset.paperId = item.id;
    const title = document.createElement('h3');
    title.textContent = item.title;
    const authors = document.createElement('p');
    authors.className = 'authors';
    authors.textContent = item.authors.join(', ');
    const meta = document.createElement('p');
    meta.className = 'meta';
    const year = translate('searchFirstSubmitted', language, [item.published.slice(0, 4)]);
    meta.textContent = `arXiv:${getPaperId(paper, preferences.version)} · ${year}`;
    const links = document.createElement('div');
    links.className = 'links';
    for (const format of READING_FORMATS) {
      const link = document.createElement('a');
      link.href = buildArxivUrl(paper, format, preferences.version);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = formatLabel(format, language);
      link.dataset.openFormat = format;
      if (format === 'html') link.title = translate('searchHtmlNote', language);
      links.append(link);
    }
    row.append(title, authors, meta, links);
    results.append(row);
  }
  const end = Math.min(feed.startIndex + feed.itemsPerPage, feed.totalResults);
  const summary = document.querySelector<HTMLElement>('#search-summary')!;
  summary.textContent = feed.totalResults === 0 ? translate('searchNoResultsSummary', language)
    : translate('searchSummary', language, [String(feed.startIndex + 1), String(end), String(feed.totalResults)]);
  document.querySelector<HTMLElement>('#search-pages')!.hidden = feed.totalResults <= SEARCH_PAGE_SIZE && feed.startIndex === 0;
  document.querySelector<HTMLElement>('#search-limit')!.hidden = feed.startIndex < MAX_SEARCH_START || end >= feed.totalResults;
}

function renderLocale(): void {
  const locale = resolveLocale(preferences.language);
  document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
  localize(document, preferences.language);
  input.placeholder = translate('searchInputPlaceholder', preferences.language);
  renderResults();
  renderControls();
}

// A permission dialog can resolve after editing or closing the page, before any job exists.
function invalidate(): void {
  generation++;
  if (activeId) {
    void chrome.runtime.sendMessage({ type: 'CANCEL_ARXIV_SEARCH', requestId: activeId }).catch(() => {});
  }
  activeId = null;
  busy = false;
}

async function search(start: number, requestPermission: boolean): Promise<void> {
  const query = normalizeSearchQuery(input.value);
  if (!ready || !query) return;
  invalidate();
  const token = generation;
  busy = true;
  try {
    if (requestPermission) {
      // Must execute in the submit gesture, before the first await.
      const permission = chrome.permissions.request(origin);
      setStatus('searchAwaitingPermission');
      const granted = await permission;
      if (generation !== token) return;
      if (!granted) {
        setStatus('searchPermissionDenied', true);
        return;
      }
    }
    setStatus('searchLoading');
    activeId = crypto.randomUUID();
    const response: MetadataResponse | undefined = await chrome.runtime.sendMessage({
      type: 'SEARCH_ARXIV', requestId: activeId, query, start,
    });
    if (generation !== token) return;
    if (!response?.ok) {
      setStatus(errorMessages[response?.error ?? 'network'] ?? 'searchNetworkFailed', true);
      return;
    }
    let updated: ArxivSearchFeed;
    try {
      updated = parseArxivSearchFeed(response.xml, start);
    } catch {
      setStatus('searchInvalidResponse', true);
      return;
    }
    if (updated.totalResults > 0 && updated.papers.length === 0) {
      setStatus('searchInvalidResponse', true);
      return;
    }
    feed = updated;
    renderResults();
    setStatus(updated.papers.length ? 'searchResultsReady' : 'searchEmpty');
    if (start > 0) document.querySelector<HTMLElement>('#results-heading')!.scrollIntoView({ block: 'nearest' });
  } catch {
    if (generation === token) setStatus('searchNetworkFailed', true);
  } finally {
    if (generation === token) {
      activeId = null;
      busy = false;
      renderControls();
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!submit.disabled) void search(0, true);
});
input.addEventListener('input', () => {
  invalidate();
  feed = null;
  renderResults();
  if (input.value.trim() === '') setStatus('searchIdle');
  else if (normalizeSearchQuery(input.value) === null) setStatus('searchInvalidQuery', true);
  else setStatus('searchReady');
});
cancel.addEventListener('click', () => {
  invalidate();
  setStatus('searchCancelled');
  submit.focus();
});
prev.addEventListener('click', () => { if (feed && !prev.disabled) void search(feed.startIndex - SEARCH_PAGE_SIZE, true); });
next.addEventListener('click', () => { if (feed && !next.disabled) void search(feed.startIndex + SEARCH_PAGE_SIZE, true); });
window.addEventListener('pagehide', invalidate);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.preferences) {
    preferences = normalizePreferences(changes.preferences.newValue);
    renderLocale();
  }
});

async function initialize(): Promise<void> {
  input.value = launch?.query ?? '';
  try {
    preferences = await getPreferences();
  } catch {
    message = 'searchLoadFailed';
  }
  ready = true;
  renderLocale();
  if (!launch) return;
  if (!launch.run) {
    setStatus('searchReady');
    return;
  }
  const token = generation;
  let allowed = false;
  try { allowed = await chrome.permissions.contains(origin); } catch { /* Submit can request access. */ }
  if (token !== generation) return;
  if (allowed) await search(0, false);
  else setStatus('searchNeedsPermission');
}

void initialize();
