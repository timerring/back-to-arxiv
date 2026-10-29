export const READING_FORMATS = ['abs', 'pdf', 'html'] as const;

export type ReadingFormat = typeof READING_FORMATS[number];

export function isReadingFormat(value: unknown): value is ReadingFormat {
  return READING_FORMATS.some((format) => format === value);
}

export interface Paper {
  /** The arXiv identifier, including its explicit version when present. */
  id: string;
  source: 'alphaxiv' | 'arxiv';
}

const SOURCES = new Map<string, Paper['source']>([
  ['alphaxiv.org', 'alphaxiv'],
  ['www.alphaxiv.org', 'alphaxiv'],
  ['arxiv.org', 'arxiv'],
  ['www.arxiv.org', 'arxiv'],
]);

// arXiv uses both YYMM.NNNN(N) and the historical archive/YYMMNNN scheme.
// Keep the version suffix as part of the identifier throughout navigation.
const PAPER_ID = /^(?:\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}|[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{2}(?:0[1-9]|1[0-2])\d{3})(?:v[1-9]\d*)?$/;

/** Extract an identifier from a supported paper page on a trusted host. */
export function parsePaperUrl(value: string): Paper | null {
  if (typeof value !== 'string') return null;

  let url: URL;
  let pathname: string;
  try {
    url = new URL(value);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const source = SOURCES.get(url.hostname);
  if (
    source === undefined ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return null;
  }

  const match = /^\/(abs|pdf|html|overview)\/(.+?)\/?$/.exec(pathname);
  if (match === null) return null;

  const route = match[1];
  if (route === 'overview' && source === 'arxiv') return null;

  let id = match[2]!;
  if (route === 'pdf' && id.endsWith('.pdf')) id = id.slice(0, -4);
  return PAPER_ID.test(id) ? { id, source } : null;
}

/** Generate a canonical, query-free arXiv URL for the requested format. */
export function buildArxivUrl(paper: Paper, format: ReadingFormat): string {
  if (typeof paper?.id !== 'string' || PAPER_ID.test(paper.id) === false) {
    throw new TypeError('A valid arXiv paper identifier is required.');
  }
  if (isReadingFormat(format) === false) {
    throw new TypeError('The reading format must be abs, pdf or html.');
  }
  return `https://arxiv.org/${format}/${paper.id}`;
}
