import { parsePaperInput, type Paper } from './paper';

export { parseArxivSearchFeed } from './citations';
export type { ArxivSearchFeed } from './citations';

export const MAX_SEARCH_QUERY_LENGTH = 300;
export const SEARCH_PAGE_SIZE = 10;
export const MAX_SEARCH_START = 190;

export type PaperEntry = { kind: 'paper'; paper: Paper } | { kind: 'search'; query: string } | { kind: 'invalid' };

/** Keep display text readable without accepting invisible controls or huge selections. */
export function normalizeSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096
    || /\p{Cc}/u.test(value.replace(/[\s\p{White_Space}]/gu, ''))) return null;
  const query = value.replace(/[\s\p{White_Space}]+/gu, ' ').trim();
  return query.length > 0 && query.length <= MAX_SEARCH_QUERY_LENGTH && /[\p{L}\p{N}]/u.test(query) ? query : null;
}

/** A failed reference stays invalid; only ordinary title/keyword text becomes a search. */
export function classifyPaperEntry(value: string): PaperEntry {
  if (typeof value !== 'string') return { kind: 'invalid' };
  const paper = parsePaperInput(value);
  if (paper !== null) return { kind: 'paper', paper };
  const query = normalizeSearchQuery(value);
  if (query === null || /:\/\//.test(query)
    || /^\/\//.test(query)
    || /^(?:arxiv|doi)\s*:/i.test(query)
    || /(?:^|\s)(?:javascript|data|file|vbscript|blob|about|chrome|chrome-extension)\s*:/i.test(query)
    || /^(?:www\.|(?:https?|ftp|mailto|tel)\s*:)/i.test(query)
    || /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(query)
    || /(?:^|\s)10\.\d{4,9}\//i.test(query)
    || /(?:^|\s)\d{4}\.\d/.test(query)
    || /(?:^|\s)[a-z][a-z.-]*\/\d{4,}/i.test(query)
    || /\]\s*\(/.test(query)
    || /^<?(?:https?|ftp|doi|arxiv)\s*:/i.test(query)
    || /^<[^<>\s]+>$/.test(query)) return { kind: 'invalid' };
  return { kind: 'search', query };
}

/** Quote each term so selected text cannot introduce arXiv's advanced query operators. */
export function buildSearchApiUrl(query: string, start = 0): string {
  const normalized = normalizeSearchQuery(query);
  if (normalized === null || Number.isInteger(start) === false || start < 0 || start > MAX_SEARCH_START
    || start % SEARCH_PAGE_SIZE !== 0) throw new TypeError('A valid search query and page offset are required.');
  const terms = normalized.replace(/["\\]/g, '').split(/\s+/).filter(Boolean);
  const url = new URL('https://export.arxiv.org/api/query');
  url.search = new URLSearchParams({ search_query: terms.map((term) => `all:"${term}"`).join(' AND '),
    start: String(start), max_results: String(SEARCH_PAGE_SIZE), sortBy: 'relevance', sortOrder: 'descending' }).toString();
  return url.href;
}

/** The caller supplies its own extension URL; launch text stays in the local fragment. */
export function buildSearchPageUrl(baseUrl: string, query: string): string {
  const normalized = normalizeSearchQuery(query);
  if (typeof baseUrl !== 'string' || baseUrl.length === 0 || baseUrl.includes('#') || normalized === null) {
    throw new TypeError('A search page URL and valid query are required.');
  }
  return `${baseUrl}#${new URLSearchParams({ q: normalized, run: '1' })}`;
}

/** Decode one bounded, unambiguous launch request. The UI consumes and clears it once. */
export function readSearchLaunch(hash: string): { query: string; run: boolean } | null {
  if (typeof hash !== 'string' || hash.length > 16_384 || hash.startsWith('#') === false) return null;
  const encoded = hash.slice(1);
  if (/%(?![\da-f]{2})/i.test(encoded)) return null;
  try { decodeURIComponent(encoded.replace(/\+/g, ' ')); } catch { return null; }
  const parameters = new URLSearchParams(encoded);
  if (parameters.getAll('q').length !== 1 || parameters.getAll('run').length > 1
    || [...parameters.keys()].some((key) => key !== 'q' && key !== 'run')) return null;
  const query = normalizeSearchQuery(parameters.get('q'));
  const run = parameters.get('run');
  return query === null || (run !== null && run !== '0' && run !== '1') ? null : { query, run: run === '1' };
}
