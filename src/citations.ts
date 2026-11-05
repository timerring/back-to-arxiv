import type { BatchResult } from './batch';
import { buildArxivUrl, buildMarkdownLink, getPaperId, parsePaperInput, parsePaperUrl } from './paper';

export const MAX_CITATION_FEED_BYTES = 2_000_000;

export interface CitationMetadata {
  /** The actual identifier returned by arXiv, including its resolved version. */
  id: string;
  title: string;
  authors: string[];
  /** The first submission date reported by arXiv. */
  published: string;
  primaryCategory?: string;
}

const ATOM = 'http://www.w3.org/2005/Atom';
const ARXIV = 'http://arxiv.org/schemas/atom';
const cleanText = (value: string): string => value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
const baseId = (id: string): string => id.replace(/v[1-9]\d*$/, '');

export class CitationParseError extends Error {
  constructor() { super('The arXiv metadata response is invalid.'); }
}

function isId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return parsePaperInput(value)?.id === value;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && Number.isFinite(Date.parse(value));
}

function normalizeMetadata(value: CitationMetadata | undefined): CitationMetadata | undefined {
  if (typeof value !== 'object' || value === null || isId(value.id) === false
    || typeof value.title !== 'string' || value.title.length > 20_000
    || Array.isArray(value.authors) === false || value.authors.length === 0 || value.authors.length > 10_000
    || value.authors.some((name) => typeof name !== 'string' || name.length > 1_000 || cleanText(name).length === 0)
    || validDate(value.published) === false) return;
  const title = cleanText(value.title);
  if (title.length === 0) return;
  const category = typeof value.primaryCategory === 'string' && /^[A-Za-z][A-Za-z0-9.-]{0,99}$/.test(value.primaryCategory)
    ? value.primaryCategory : undefined;
  return { id: value.id, title, authors: value.authors.map(cleanText), published: value.published,
    ...(category === undefined ? {} : { primaryCategory: category }) };
}

/** Only return metadata that really describes the selected identifier and version. */
export function citationForId(id: string, metadata: ReadonlyMap<string, CitationMetadata>): CitationMetadata | undefined {
  if (isId(id) === false) return;
  const citation = normalizeMetadata(metadata.get(id));
  if (citation === undefined) return;
  if (/v[1-9]\d*$/.test(id) ? citation.id === id : baseId(citation.id) === id) return citation;
}

function children(parent: Element, name: string, namespace = ATOM): Element[] {
  return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1
    && (node as Element).localName === name && (node as Element).namespaceURI === namespace);
}

function text(parent: Element, name: string): string {
  const nodes = children(parent, name);
  if (nodes.length !== 1 || Array.from(nodes[0]!.childNodes).some((node) => node.nodeType === 1)) return '';
  return cleanText(nodes[0]!.textContent ?? '');
}

function newer(left: string, right: string): boolean {
  const a = /v([1-9]\d*)$/.exec(left)?.[1] ?? '0';
  const b = /v([1-9]\d*)$/.exec(right)?.[1] ?? '0';
  return a.length !== b.length ? a.length > b.length : a > b;
}

/** Parse an Atom response, matching IDs rather than relying on response order. */
export function parseArxivFeed(xml: string, requestedIds: readonly string[]): Map<string, CitationMetadata> {
  if (Array.isArray(requestedIds) === false || requestedIds.some((id) => isId(id) === false)) {
    throw new TypeError('Valid arXiv identifiers are required.');
  }
  if (typeof xml !== 'string' || new TextEncoder().encode(xml).byteLength > MAX_CITATION_FEED_BYTES
    || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new CitationParseError();
  let document: Document;
  try { document = new DOMParser().parseFromString(xml, 'application/xml'); }
  catch { throw new CitationParseError(); }
  const feed = document.documentElement;
  if (feed === null || feed.localName !== 'feed' || feed.namespaceURI !== ATOM
    || document.getElementsByTagNameNS('*', 'parsererror').length > 0 || document.doctype !== null) throw new CitationParseError();

  const candidates = new Map<string, CitationMetadata>();
  for (const entry of children(feed, 'entry')) {
    const url = text(entry, 'id');
    if (/^https?:\/\/(?:www\.)?arxiv\.org\/api\/errors(?:[#/?]|$)/.test(url)) throw new CitationParseError();
    const paper = parsePaperUrl(url);
    if (paper?.source !== 'arxiv') continue;
    const category = children(entry, 'primary_category', ARXIV)[0]?.getAttribute('term') ?? undefined;
    const metadata = normalizeMetadata({ id: paper.id, title: text(entry, 'title'),
      authors: children(entry, 'author').map((author) => text(author, 'name')),
      published: text(entry, 'published'), ...(category === undefined ? {} : { primaryCategory: category }) });
    if (metadata !== undefined && candidates.has(metadata.id) === false) candidates.set(metadata.id, metadata);
  }
  const result = new Map<string, CitationMetadata>();
  for (const id of requestedIds) {
    const exactVersion = /v[1-9]\d*$/.test(id);
    let selected: CitationMetadata | undefined;
    for (const candidate of candidates.values()) {
      if (exactVersion ? candidate.id !== id : baseId(candidate.id) !== id) continue;
      if (selected === undefined || newer(candidate.id, selected.id)) selected = candidate;
    }
    if (selected !== undefined) result.set(id, selected);
  }
  return result;
}

function markdownLabel(value: string): string {
  // Escape link delimiters, HTML, formatting and Obsidian's math/wiki delimiters.
  return cleanText(value).replace(/[\\`*_{}\[\]()<>!#|~$&]/g, '\\$&');
}

/** Missing metadata keeps its original identifier label, so no valid paper disappears. */
export function buildCitationMarkdown(result: BatchResult, metadata: ReadonlyMap<string, CitationMetadata>, includeTitles = true): string {
  if (result.error !== null || result.papers.length === 0) return '';
  const lines = result.papers.map((paper) => {
    const id = getPaperId(paper, result.version);
    const citation = includeTitles ? citationForId(id, metadata) : undefined;
    return `- ${citation === undefined ? buildMarkdownLink(paper, result.version)
      : `[${markdownLabel(citation.title)}](${buildArxivUrl(paper, 'abs', result.version)})`}`;
  });
  return `${lines.join('\n')}\n`;
}

function bibtexText(value: string): string {
  const escaped: Record<string, string> = {
    '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#',
    '%': '\\%', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}',
  };
  return cleanText(value).replace(/[\\{}$&#%_^~]/g, (character) => escaped[character]!);
}

function bibtexAuthor(name: string): string {
  const escaped = bibtexText(name);
  // arXiv exposes author names as strings; keep common collaborations and embedded
  // "and" intact while leaving ordinary personal names available to BibTeX parsers.
  return /\band\b|\b(?:collaboration|consortium|committee|team|group)\b/i.test(name) ? `{${escaped}}` : escaped;
}

/** A Zotero-importable preprint bibliography from verified, successfully fetched metadata. */
export function buildBatchBibtex(result: BatchResult, metadata: ReadonlyMap<string, CitationMetadata>): string {
  if (result.error !== null) return '';
  const records: string[] = [];
  for (const paper of result.papers) {
    const id = getPaperId(paper, result.version);
    const citation = citationForId(id, metadata);
    if (citation === undefined) continue;
    // Valid arXiv IDs contain no underscores; keeping hyphens makes the modern and
    // historical identifier schemes distinct without ambiguous citation-key folding.
    const key = `arxiv_${id.replace(/[./]/g, '_')}`;
    const fields = [
      `  title = {{${bibtexText(citation.title)}}}`,
      `  author = {${citation.authors.map(bibtexAuthor).join(' and ')}}`,
      `  year = {${citation.published.slice(0, 4)}}`,
      `  eprint = {${id}}`,
      '  archivePrefix = {arXiv}',
      ...(citation.primaryCategory === undefined ? [] : [`  primaryClass = {${bibtexText(citation.primaryCategory)}}`]),
      `  url = {${buildArxivUrl(paper, 'abs', result.version)}}`,
    ];
    records.push(`@misc{${key},\n${fields.join(',\n')}\n}`);
  }
  return records.length === 0 ? '' : `${records.join('\n\n')}\n`;
}
