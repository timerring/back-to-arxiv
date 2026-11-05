import { buildMarkdownLink, getPaperId, isPaperVersion, parsePaperInput, type Paper, type PaperVersion } from './paper';

export const MAX_BATCH_CHARACTERS = 100_000;
export const MAX_BATCH_REFERENCES = 500;

export type BatchEntry = { lineNumber: number; input: string } & (
  | { status: 'valid'; paper: Paper; id: string }
  | { status: 'duplicate'; paper: Paper; id: string; duplicateOf: number }
  | { status: 'invalid' }
);

export interface BatchResult {
  version: PaperVersion;
  entries: BatchEntry[];
  papers: Paper[];
  duplicateCount: number;
  invalidCount: number;
  error: 'inputTooLong' | 'tooManyReferences' | null;
}

/** Analyze explicit, one-per-line references without fetching or storing anything. */
export function analyzeBatch(input: string, version: PaperVersion = 'current'): BatchResult {
  if (typeof input !== 'string') throw new TypeError('Batch input must be a string.');
  if (isPaperVersion(version) === false) throw new TypeError('The paper version must be current or latest.');
  const result: BatchResult = { version, entries: [], papers: [], duplicateCount: 0, invalidCount: 0, error: null };
  if (input.length > MAX_BATCH_CHARACTERS) return { ...result, error: 'inputTooLong' };

  const lines = input.split(/\r\n|\r|\n/)
    .map((line, index) => ({ lineNumber: index + 1, input: line.trim() }))
    .filter((line) => line.input.length > 0);
  // Never export a truncated subset: the user must correct an oversized batch first.
  if (lines.length > MAX_BATCH_REFERENCES) return { ...result, error: 'tooManyReferences' };

  const firstLines = new Map<string, number>();
  for (const line of lines) {
    const reference = line.input.replace(/^(?:[-*+]|\d+[.)])[ \t]+/, '').trim();
    const paper = parsePaperInput(reference);
    if (paper === null) {
      result.entries.push({ ...line, status: 'invalid' });
      result.invalidCount++;
      continue;
    }
    const id = getPaperId(paper, version);
    const duplicateOf = firstLines.get(id);
    if (duplicateOf !== undefined) {
      result.entries.push({ ...line, status: 'duplicate', paper, id, duplicateOf });
      result.duplicateCount++;
    } else {
      firstLines.set(id, line.lineNumber);
      result.entries.push({ ...line, status: 'valid', paper, id });
      result.papers.push(paper);
    }
  }
  return result;
}

/** Export unique valid papers in source order; invalid and duplicate lines stay out. */
export function buildBatchMarkdown(result: BatchResult): string {
  if (result.error !== null || result.papers.length === 0) return '';
  return `${result.papers.map((paper) => `- ${buildMarkdownLink(paper, result.version)}`).join('\n')}\n`;
}
