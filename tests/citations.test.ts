import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { analyzeBatch, buildBatchMarkdown } from '../src/batch.ts';
import { buildBatchBibtex, buildCitationMarkdown, citationForId, CitationParseError, MAX_CITATION_FEED_BYTES, parseArxivFeed, type CitationMetadata } from '../src/citations.ts';

// Use an independent XML DOM in Node; browsers supply their native strict parser.
class StrictDOMParser extends XmlDOMParser {
  constructor() { super({ onError: () => { throw new Error('Invalid XML'); } }); }
}
globalThis.DOMParser = StrictDOMParser as unknown as typeof DOMParser;

const atom = 'http://www.w3.org/2005/Atom';
const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const feed = (...entries: string[]): string => `<?xml version="1.0"?><feed xmlns="${atom}" xmlns:arxiv="http://arxiv.org/schemas/atom">${entries.join('')}</feed>`;
const citation = (id = '1706.03762v3', patch: Partial<CitationMetadata> = {}): CitationMetadata => ({
  id, title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'], published: '2017-06-12T17:57:34Z', primaryCategory: 'cs.CL', ...patch,
});
const entry = (id = '1706.03762v3', patch: Partial<CitationMetadata> = {}): string => {
  const value = citation(id, patch);
  return `<entry><id>http://arxiv.org/abs/${escapeXml(value.id)}</id><title>${escapeXml(value.title)}</title>
    <published>${escapeXml(value.published)}</published><updated>2023-08-02T00:41:18Z</updated>
    ${value.authors.map((name) => `<author><name>${escapeXml(name)}</name><arxiv:affiliation>Example</arxiv:affiliation></author>`).join('')}
    ${value.primaryCategory === undefined ? '' : `<arxiv:primary_category term="${escapeXml(value.primaryCategory)}"/>`}</entry>`;
};

test('Atom IDs match requests regardless of response order and preserve exact versions', () => {
  const result = parseArxivFeed(feed(
    entry('1706.03762v7', { title: 'Latest title' }), entry('hep-th/9901001v2'), entry('1706.03762v1', { title: 'Original title' }),
  ), ['1706.03762v1', '1706.03762', '1706.03762v3', 'hep-th/9901001v2']);
  assert.deepEqual([...result.keys()], ['1706.03762v1', '1706.03762', 'hep-th/9901001v2']);
  assert.equal(result.get('1706.03762v1')?.title, 'Original title');
  assert.equal(result.get('1706.03762')?.id, '1706.03762v7');
  assert.equal(result.has('1706.03762v3'), false, 'Missing v3 never silently receives latest metadata');
  assert.deepEqual(result.get('hep-th/9901001v2')?.authors, ['Ashish Vaswani', 'Noam Shazeer']);
});

test('an unversioned request selects the greatest numeric version rather than feed position', () => {
  const result = parseArxivFeed(feed(entry('1706.03762v2'), entry('1706.03762v101'), entry('1706.03762v9')), ['1706.03762']);
  assert.equal(result.get('1706.03762')?.id, '1706.03762v101');
});

test('Atom parsing normalizes whitespace, decodes XML text and keeps author order and first submission date', () => {
  const result = parseArxivFeed(feed(entry('1706.03762v3', {
    title: '  A & B\n   on [AI]  ', authors: ['  Élodie\n Müller  ', '张 三'], published: '2024-02-29T00:00:00Z',
  })), ['1706.03762v3']);
  assert.deepEqual(result.get('1706.03762v3'), citation('1706.03762v3', {
    title: 'A & B on [AI]', authors: ['Élodie Müller', '张 三'], published: '2024-02-29T00:00:00Z',
  }));
});

test('only direct Atom fields are accepted and malformed or unrequested entries stay missing', () => {
  const untrusted = entry('1706.03762v3').replace('<title>', '<title xmlns="https://evil.example/">');
  const nested = entry('1706.03762v3').replace('<title>Attention Is All You Need</title>', '<summary><title>Impostor</title></summary>');
  const markup = entry('1706.03762v3').replace('<title>Attention Is All You Need</title>', '<title><b>Embedded markup</b></title>');
  const invalidDates = ['2023-02-29', '2024-02-31', '2024-13-01', '2024-01-01T25:00:00Z', 'invalid'];
  for (const xml of [untrusted, nested, markup, entry('1706.03762v3', { authors: [] }), entry('1706.03762v3', { authors: ['  '] }),
    entry('1706.03762v3', { title: '' }), ...invalidDates.map((published) => entry('1706.03762v3', { published }))]) {
    assert.equal(parseArxivFeed(feed(xml, entry('2301.12345v1')), ['1706.03762v3']).size, 0);
  }
  const hostileId = entry('1706.03762v3').replace('http://arxiv.org/abs/', 'https://arxiv.org.evil.example/abs/');
  assert.equal(parseArxivFeed(feed(hostileId), ['1706.03762v3']).size, 0);
  assert.equal(parseArxivFeed(feed(entry('1706.03762v3')), ['2301.12345']).size, 0);
});

test('malformed feeds, HTML responses, custom entities and arXiv API errors are rejected', () => {
  for (const xml of ['', '<html><body>Busy</body></html>', '<feed/>', `<feed xmlns="${atom}"><entry></feed>`,
    `<!DOCTYPE feed [<!ENTITY injected SYSTEM "https://evil.example/">]>${feed()}`,
    `<!ENTITY injected "text">${feed()}`,
    feed('<entry><id>http://arxiv.org/api/errors#incorrect_id_format</id><title>Error</title></entry>')]) {
    assert.throws(() => parseArxivFeed(xml, ['1706.03762v3']), CitationParseError);
  }
  assert.equal(parseArxivFeed(feed(), ['1706.03762v3']).size, 0, 'A valid empty result is not a parser failure');
});

test('the XML size cap is measured in bytes and invalid request identifiers fail explicitly', () => {
  assert.throws(() => parseArxivFeed('x'.repeat(MAX_CITATION_FEED_BYTES + 1), []), CitationParseError);
  assert.throws(() => parseArxivFeed('文'.repeat(Math.ceil(MAX_CITATION_FEED_BYTES / 3)), []), CitationParseError);
  for (const ids of [['https://arxiv.org/abs/1706.03762'], ['arXiv:1706.03762'], ['not an ID'], [null]]) {
    assert.throws(() => parseArxivFeed(feed(), ids as string[]), TypeError);
  }
});

test('metadata lookup refuses mis-keyed, cross-version and incomplete records', () => {
  for (const wrong of [citation('2301.12345v1'), citation('1706.03762v4'), citation('1706.03762v3', { authors: [] }),
    citation('1706.03762v3', { published: '2024-02-31' }), citation('1706.03762v3', { title: ' ' })]) {
    assert.equal(citationForId('1706.03762v3', new Map([['1706.03762v3', wrong]])), undefined);
  }
  assert.equal(citationForId('1706.03762', new Map([['1706.03762', citation('1706.03762v7')]]))?.id, '1706.03762v7');
});

test('titled Markdown retains source order, falls back for missing metadata and can be reimported', () => {
  const result = analyzeBatch('1706.03762v3\nwrong\nhttps://arxiv.org/pdf/1706.03762v3.pdf\nhep-th/9901001v2');
  const metadata = new Map([['1706.03762v3', citation()]]);
  const markdown = buildCitationMarkdown(result, metadata);
  assert.equal(markdown, '- [Attention Is All You Need](https://arxiv.org/abs/1706.03762v3)\n- [arXiv:hep-th/9901001v2](https://arxiv.org/abs/hep-th/9901001v2)\n');
  assert.deepEqual(analyzeBatch(markdown).papers.map((paper) => paper.id), result.papers.map((paper) => paper.id));
  assert.equal(buildCitationMarkdown(result, metadata, false), buildBatchMarkdown(result));
  assert.equal(buildCitationMarkdown(result, new Map([['1706.03762v3', citation('2301.12345v2')]])), buildBatchMarkdown(result));
});

test('Markdown title escaping prevents link, HTML and Obsidian syntax injection', () => {
  const title = 'A [title](javascript:alert(1)) <img src=x> &amp; [[wiki]] $x$ _a_ `code` \\ test';
  const result = analyzeBatch('1706.03762v3');
  const markdown = buildCitationMarkdown(result, new Map([['1706.03762v3', citation(undefined, { title })]]));
  assert.ok(markdown.includes('\\[title\\]\\(javascript:alert\\(1\\)\\)'));
  assert.ok(markdown.includes('\\<img src=x\\>'));
  assert.ok(markdown.includes('\\&amp;'));
  assert.ok(markdown.includes('\\[\\[wiki\\]\\]'));
  assert.ok(markdown.includes('\\$x\\$'));
  assert.ok(markdown.includes('\\\\ test'));
  assert.equal(analyzeBatch(markdown).invalidCount, 0);
  assert.equal(analyzeBatch(markdown).papers[0]?.id, '1706.03762v3');
});

test('BibTeX imports through an independent parser with title, authors, date and canonical versioned URL', () => {
  const result = analyzeBatch('1706.03762v3\n1706.03762v3\nhep-th/9901001v2');
  const metadata = new Map([['1706.03762v3', citation()], ['hep-th/9901001v2', citation('hep-th/9901001v2', {
    title: 'A Historical Paper', authors: ['Élodie Müller', 'ATLAS Collaboration'], published: '1999-01-10', primaryCategory: 'hep-th',
  })]]);
  const bibtex = buildBatchBibtex(result, metadata);
  const records = new Cite(bibtex).data;
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record['citation-key']), ['arxiv_1706_03762v3', 'arxiv_hep-th_9901001v2']);
  assert.equal(records[0]?.title, 'Attention Is All You Need');
  assert.deepEqual(records[0]?.author, [{ given: 'Ashish', family: 'Vaswani' }, { given: 'Noam', family: 'Shazeer' }]);
  assert.deepEqual(records[0]?.issued?.['date-parts'], [[2017]], 'Use first submission year, not latest update year');
  assert.equal(records[0]?.URL, 'https://arxiv.org/abs/1706.03762v3');
  assert.deepEqual(records[1]?.author, [{ given: 'Élodie', family: 'Müller' }, { family: 'ATLAS Collaboration' }]);
  assert.match(bibtex, /eprint = \{1706\.03762v3\}/);
  assert.match(bibtex, /primaryClass = \{hep-th\}/);
});

test('BibTeX escaping preserves Unicode and punctuation without allowing extra records or fields', () => {
  const title = '安全 R&D_#1: {A} 50% $x^2$ ~ \\ } @misc{injected, title={Fake}}';
  const metadata = new Map([['1706.03762v3', citation(undefined, { title,
    authors: ['René Müller', 'Research and Design Collaboration'], primaryCategory: undefined })]]);
  const output = buildBatchBibtex(analyzeBatch('1706.03762v3'), metadata);
  const records = new Cite(output).data;
  assert.equal(records.length, 1);
  assert.equal(records[0]?.title, title);
  assert.deepEqual(records[0]?.author, [{ given: 'René', family: 'Müller' }, { family: 'Research and Design Collaboration' }]);
  assert.equal(records[0]?.URL, 'https://arxiv.org/abs/1706.03762v3');
  assert.equal(output.includes('primaryClass'), false);
});

test('latest-version exports merge references and use only metadata matching that selected policy', () => {
  const result = analyzeBatch('1706.03762v3\n1706.03762v7\n2301.12345v2', 'latest');
  const metadata = new Map([['1706.03762', citation('1706.03762v7')], ['2301.12345v2', citation('2301.12345v2')]]);
  assert.equal(buildCitationMarkdown(result, metadata), '- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)\n- [arXiv:2301.12345](https://arxiv.org/abs/2301.12345)\n');
  const output = buildBatchBibtex(result, metadata);
  const records = new Cite(output).data;
  assert.equal(records.length, 1);
  assert.equal(records[0]?.['citation-key'], 'arxiv_1706_03762');
  assert.equal(records[0]?.URL, 'https://arxiv.org/abs/1706.03762');
  assert.match(output, /eprint = \{1706\.03762\}/);
});

test('empty, invalid-only and oversized batches produce no bibliography and never export partial oversize input', () => {
  const metadata = new Map([['1706.03762v3', citation()]]);
  for (const result of [analyzeBatch(''), analyzeBatch('wrong'), analyzeBatch('1706.03762v3\n' + 'x'.repeat(100_000))]) {
    assert.equal(buildBatchBibtex(result, metadata), '');
    assert.equal(buildCitationMarkdown(result, metadata), '');
  }
  assert.equal(buildBatchBibtex(analyzeBatch('1706.03762v3'), new Map()), '');
});
