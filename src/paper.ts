export const READING_FORMATS = ['abs', 'pdf', 'html'] as const;

export type ReadingFormat = typeof READING_FORMATS[number];
export type PaperVersion = 'current' | 'latest';

export function isReadingFormat(value: unknown): value is ReadingFormat {
  return READING_FORMATS.some((format) => format === value);
}

export function isPaperVersion(value: unknown): value is PaperVersion {
  return value === 'current' || value === 'latest';
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
// Parsing retains explicit versions; the selected version policy controls output.
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

/** Resolve only arXiv's DOI namespace, whose identifiers refer to the latest version. */
function parseArxivDoiName(value: string): Paper | null {
  const match = /^10\.48550\/arxiv\.(.+)$/i.exec(value);
  if (match === null) return null;
  // DOI names are case-insensitive; restore arXiv's historical archive/class casing.
  const id = match[1]!.replace(/^([a-z][a-z-]*)(?:\.([a-z]{2}))?\//i,
    (_match, archive: string, category: string | undefined) => `${archive.toLowerCase()}${category ? `.${category.toUpperCase()}` : ''}/`);
  if (PAPER_ID.test(id) === false || /v\d+$/i.test(id)) return null;
  return { id, source: 'arxiv' };
}

/** Wrapper destinations must be complete trusted URLs, never relative IDs or DOI names. */
function parsePaperReferenceUrl(value: string): Paper | null {
  const paper = parsePaperUrl(value);
  if (paper !== null) return paper;
  if (/^https?:\/\//i.test(value) === false) return null;
  let url: URL;
  let pathname: string;
  try {
    url = new URL(value);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (
    (url.hostname !== 'doi.org' && url.hostname !== 'dx.doi.org') ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username.length > 0 || url.password.length > 0 || url.port.length > 0
  ) return null;
  return parseArxivDoiName(pathname.slice(1));
}

/** Accept one complete paper URL, identifier, DOI, or simple inline link. */
export function parsePaperInput(value: string): Paper | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (input.length === 0 || input.length > 4096) return null;
  // A small, deliberate Markdown subset: one label and one URL, without titles or nested links.
  // Labels are ignored; the destination alone determines the paper.
  const markdown = /^\[(?:\\[^\r\n]|[^\[\]\\\r\n])*\]\((?:<([^<>\s]+)>|([^<>()\s]+))\)$/.exec(input);
  const autolink = /^<([^<>\s]+)>$/.exec(input);
  const destination = markdown?.[1] ?? markdown?.[2] ?? autolink?.[1];
  if (destination !== undefined) return parsePaperReferenceUrl(destination);
  const paper = parsePaperReferenceUrl(input) ?? parseArxivDoiName(input.replace(/^doi:[ \t]*/i, ''));
  if (paper !== null) return paper;
  const id = input.replace(/^arxiv:\s*/i, '');
  return PAPER_ID.test(id) ? { id, source: 'arxiv' } : null;
}

/** Resolve the requested version while retaining the source paper identifier. */
export function getPaperId(paper: Paper, version: PaperVersion = 'current'): string {
  if (typeof paper?.id !== 'string' || PAPER_ID.test(paper.id) === false) {
    throw new TypeError('A valid arXiv paper identifier is required.');
  }
  if (isPaperVersion(version) === false) {
    throw new TypeError('The paper version must be current or latest.');
  }
  return version === 'latest' ? paper.id.replace(/v[1-9]\d*$/, '') : paper.id;
}

/** Generate a canonical, query-free arXiv URL for the requested format and version. */
export function buildArxivUrl(paper: Paper, format: ReadingFormat, version: PaperVersion = 'current'): string {
  const id = getPaperId(paper, version);
  if (isReadingFormat(format) === false) {
    throw new TypeError('The reading format must be abs, pdf or html.');
  }
  return `https://arxiv.org/${format}/${id}`;
}

/** A stable, title-free Markdown citation to the selected abstract page. */
export function buildMarkdownLink(paper: Paper, version: PaperVersion = 'current'): string {
  return `[arXiv:${getPaperId(paper, version)}](${buildArxivUrl(paper, 'abs', version)})`;
}
