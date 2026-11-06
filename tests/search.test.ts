import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { CitationParseError, MAX_CITATION_FEED_BYTES } from '../src/citations.ts';
import { buildSearchApiUrl, buildSearchPageUrl, classifyPaperEntry, MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_START, normalizeSearchQuery, parseArxivSearchFeed, readSearchLaunch, SEARCH_PAGE_SIZE } from '../src/search.ts';

class StrictDOMParser extends XmlDOMParser {
  constructor() { super({ onError: () => { throw new Error('Invalid XML'); } }); }
}
globalThis.DOMParser = StrictDOMParser as unknown as typeof DOMParser;

const atom = 'http://www.w3.org/2005/Atom';
const openSearch = 'http://a9.com/-/spec/opensearch/1.1/';
const escapeXml = (value: string): string => value.replace(/[&<>"']/g,
  (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const entry = (id = '1706.03762v3', title = 'Attention Is All You Need'): string => `<entry>
  <id>http://arxiv.org/abs/${escapeXml(id)}</id><title>${escapeXml(title)}</title>
  <published>2017-06-12T17:57:34Z</published><author><name>Ashish Vaswani</name></author>
  <author><name>Noam Shazeer</name></author><arxiv:primary_category term="cs.CL"/></entry>`;
const feed = (entries: string[] = [], total = entries.length, start = 0, pageSize = 10): string => `<?xml version="1.0"?>
  <feed xmlns="${atom}" xmlns:opensearch="${openSearch}" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>${total}</opensearch:totalResults><opensearch:startIndex>${start}</opensearch:startIndex>
  <opensearch:itemsPerPage>${pageSize}</opensearch:itemsPerPage>${entries.join('')}</feed>`;

test('search normalization preserves Unicode and title punctuation while collapsing whitespace', () => {
  assert.equal(normalizeSearchQuery(' \t [CLS]  Tokens\n for 中文\u00a0and Élodie\u0085 '), '[CLS] Tokens for 中文 and Élodie');
  assert.equal(normalizeSearchQuery('Neural "Attention": R&D \\ Transformers'), 'Neural "Attention": R&D \\ Transformers');
  assert.equal(normalizeSearchQuery('x'.repeat(MAX_SEARCH_QUERY_LENGTH)), 'x'.repeat(MAX_SEARCH_QUERY_LENGTH));
  assert.equal(normalizeSearchQuery(' '.repeat(4095) + 'x'), 'x');
});

test('search normalization rejects oversized, empty, non-text and control-only selections', () => {
  for (const query of [null, undefined, {}, 123, '', ' \n ', '[] ! + \\', '\u0000Title', 'Title\u0001', 'Title\u007f', 'Title\u009f',
    'x'.repeat(MAX_SEARCH_QUERY_LENGTH + 1), ' '.repeat(4096) + 'x']) {
    assert.equal(normalizeSearchQuery(query), null, String(query));
  }
});

test('entry classification prioritizes complete supported paper references', () => {
  for (const value of ['1706.03762v3', 'arXiv: 1706.03762v3', 'https://arxiv.org/abs/1706.03762v3',
    'http://alphaxiv.org/overview/1706.03762v3', 'https://doi.org/10.48550/arXiv.1706.03762',
    '[Attention](https://arxiv.org/abs/1706.03762v3)', '<https://arxiv.org/abs/1706.03762v3>']) {
    const result = classifyPaperEntry(value);
    assert.equal(result.kind, 'paper', value);
    if (result.kind === 'paper') assert.match(result.paper.id, /^1706\.03762/);
  }
});

test('titles and keywords become normalized search text including legitimate bracketed tokens', () => {
  for (const [value, query] of [[' Attention\n Is All You Need ', 'Attention Is All You Need'],
    ['[CLS] Tokens for Vision Transformers', '[CLS] Tokens for Vision Transformers'],
    ['Title: A New Method', 'Title: A New Method'], ['深度学习 注意力', '深度学习 注意力']]) {
    assert.deepEqual(classifyPaperEntry(value!), { kind: 'search', query });
  }
});

test('failed URLs, DOIs, arXiv-like IDs and Markdown links never turn into searches', () => {
  for (const value of ['https://example.com/abs/1706.03762', 'https://arxiv.org.evil.example/abs/1706.03762',
    'https://arxiv.org@evil.example/abs/1706.03762', 'www.arxiv.org/abs/1706.03762', 'arxiv.org/abs/1706.03762',
    'example.com/papers', '//example.com/papers',
    'https://arxiv.org/abs/not-an-id', 'javascript:alert(1)', 'data:text/html,Title', 'file:///tmp/Title',
    'chrome-extension://other-id/paper', 'doi:10.1000/example', '10.1000/example', 'arXiv:wrong',
    '1713.03762', '1706.03762v0', '1706.123', '1706.123456', 'hep-th/9913001', 'hep-th/9901001v0',
    '[Title](https://evil.example/1706.03762)', '[Title](https://arxiv.org/abs/1706.03762',
    '[Title] (1706.03762)', '![Title](https://arxiv.org/abs/1706.03762)',
    'Read https://evil.example/abs/1706.03762', '1706.03762 and 2301.12345', '', '\u0000Title']) {
    assert.deepEqual(classifyPaperEntry(value), { kind: 'invalid' }, value);
  }
});

test('API URLs use fixed arXiv endpoint, small relevance pages and literal AND-combined terms', () => {
  const url = new URL(buildSearchApiUrl('  Attention\n Is All You Need  '));
  assert.equal(url.origin + url.pathname, 'https://export.arxiv.org/api/query');
  assert.equal(url.searchParams.get('search_query'), 'all:"Attention" AND all:"Is" AND all:"All" AND all:"You" AND all:"Need"');
  assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([key]) => key !== 'search_query')),
    { start: '0', max_results: String(SEARCH_PAGE_SIZE), sortBy: 'relevance', sortOrder: 'descending' });
  assert.equal(new URL(buildSearchApiUrl('中文', MAX_SEARCH_START)).searchParams.get('start'), '190');
});

test('query punctuation cannot break out of quoted terms into advanced operators', () => {
  const query = '"attention" OR cat:cs.AI \\ ANDNOT (au:Someone) ""';
  assert.equal(new URL(buildSearchApiUrl(query)).searchParams.get('search_query'),
    'all:"attention" AND all:"OR" AND all:"cat:cs.AI" AND all:"ANDNOT" AND all:"(au:Someone)"');
  assert.equal(normalizeSearchQuery(query), query, 'The displayed query retains its original punctuation');
});

test('invalid API query and offset arguments fail explicitly', () => {
  for (const value of ['', '!', 'x'.repeat(301), null, 123]) assert.throws(() => buildSearchApiUrl(value as string), TypeError);
  for (const start of [-10, 1, 9, 11, 191, 200, 1.5, NaN, Infinity, '10', null]) {
    assert.throws(() => buildSearchApiUrl('Title', start as number), TypeError);
  }
});

test('extension launch URLs carry normalized text in a local fragment and round trip once', () => {
  const base = 'chrome-extension://extension-id/search.html';
  const url = buildSearchPageUrl(base, ' A & B\n 中文 # title ');
  assert.equal(url, `${base}#q=A+%26+B+%E4%B8%AD%E6%96%87+%23+title&run=1`);
  assert.deepEqual(readSearchLaunch(new URL(url).hash), { query: 'A & B 中文 # title', run: true });
  assert.deepEqual(readSearchLaunch('#q=Title'), { query: 'Title', run: false });
  assert.deepEqual(readSearchLaunch('#q=Title&run=0'), { query: 'Title', run: false });
  assert.equal(new URL(url).search, '');
});

test('launch decoding rejects ambiguous, malformed, oversized and invalid requests', () => {
  for (const hash of ['', '#', 'q=Title', '#run=1', '#q=', '#q=Title&q=Other', '#q=Title&run=1&run=0', '#q=Title&other=x',
    '#q=Title&run=yes', '#q=%ZZ', '#q=%E0%A4%A', '#q=%00Title', '#q=' + 'x'.repeat(301), '#q=' + 'x'.repeat(16_384)]) {
    assert.equal(readSearchLaunch(hash), null, hash.slice(0, 80));
  }
  for (const [base, query] of [['', 'Title'], ['search.html#q=Old', 'Title'], ['search.html', ''], ['search.html', '!']]) {
    assert.throws(() => buildSearchPageUrl(base!, query!), TypeError);
  }
});

test('search Atom parsing keeps relevance order, resolved versions, metadata and first duplicate', () => {
  const result = parseArxivSearchFeed(feed([entry('2301.12345v2', 'First'), entry('1706.03762v3', ' Second\n Title '),
    entry('2301.12345v2', 'Duplicate')], 123));
  assert.deepEqual(result, { totalResults: 123, startIndex: 0, itemsPerPage: 10, papers: [
    { id: '2301.12345v2', title: 'First', authors: ['Ashish Vaswani', 'Noam Shazeer'], published: '2017-06-12T17:57:34Z', primaryCategory: 'cs.CL' },
    { id: '1706.03762v3', title: 'Second Title', authors: ['Ashish Vaswani', 'Noam Shazeer'], published: '2017-06-12T17:57:34Z', primaryCategory: 'cs.CL' },
  ] });
  assert.equal(parseArxivSearchFeed(feed([entry('hep-th/9901001')])).papers[0]?.id, 'hep-th/9901001');
});

test('valid empty and final pages retain the API counts and requested offset', () => {
  assert.deepEqual(parseArxivSearchFeed(feed()), { papers: [], totalResults: 0, startIndex: 0, itemsPerPage: 10 });
  assert.deepEqual(parseArxivSearchFeed(feed([], 0, 10), 10), { papers: [], totalResults: 0, startIndex: 10, itemsPerPage: 10 });
  assert.equal(parseArxivSearchFeed(feed([entry()], 11, 10), 10).papers.length, 1);
});

test('search Atom only accepts direct trusted ID fields and skips individual malformed entries', () => {
  const valid = entry();
  const badEntries = [
    valid.replace('http://arxiv.org/abs/', 'https://arxiv.org.evil.example/abs/'),
    valid.replace('http://arxiv.org/abs/', 'https://alphaxiv.org/abs/'),
    valid.replace('http://arxiv.org/abs/', 'https://arxiv.org/pdf/'),
    valid.replace('</id>', '?redirect=evil</id>'),
    valid.replace('<id>', '<id xmlns="https://evil.example/">'),
    valid.replace('<id>', '<summary><id>').replace('</id>', '</id></summary>'),
    valid.replace('<title>Attention Is All You Need</title>', '<title><b>Markup</b></title>'),
    valid.replace('<title>', '<title xmlns="https://evil.example/">'),
    valid.replace('2017-06-12T17:57:34Z', '2023-02-29'),
    valid.replace('<name>Ashish Vaswani</name>', '<name> </name>'),
  ];
  for (const bad of badEntries) {
    assert.deepEqual(parseArxivSearchFeed(feed([bad, entry('2301.12345v1')])).papers.map((paper) => paper.id), ['2301.12345v1']);
  }
});

test('search fields decode XML text and preserve safe plain text punctuation and author order', () => {
  const xml = entry('1706.03762v3', 'A & B <script>alert(1)</script> [CLS] 中文')
    .replace('Ashish Vaswani', '  Élodie\n Müller ').replace('Noam Shazeer', '张 三');
  const paper = parseArxivSearchFeed(feed([xml])).papers[0]!;
  assert.equal(paper.title, 'A & B <script>alert(1)</script> [CLS] 中文');
  assert.deepEqual(paper.authors, ['Élodie Müller', '张 三']);
});

test('OpenSearch counts must be direct, unique, correctly namespaced safe nonnegative integers', () => {
  for (const tag of ['totalResults', 'startIndex', 'itemsPerPage']) {
    const xml = feed([entry()]);
    const node = new RegExp(`<opensearch:${tag}>([^<]+)</opensearch:${tag}>`);
    for (const replacement of ['', `<${tag}>1</${tag}>`, `<opensearch:${tag} xmlns:opensearch="https://evil.example/">1</opensearch:${tag}>`,
      `<summary><opensearch:${tag}>1</opensearch:${tag}></summary>`,
      `<opensearch:${tag}><b>1</b></opensearch:${tag}>`, ...['-1', '1.5', 'NaN', 'Infinity', '9007199254740992'].map(
        (count) => `<opensearch:${tag}>${count}</opensearch:${tag}>`)]) {
      assert.throws(() => parseArxivSearchFeed(xml.replace(node, replacement)), CitationParseError, `${tag}: ${replacement}`);
    }
    assert.throws(() => parseArxivSearchFeed(xml.replace(node, '$&$&')), CitationParseError);
  }
});

test('search response offsets, page sizes and entry counts must match the bounded request', () => {
  for (const xml of [feed([entry()], 100, 10), feed([], 0, 0, 11), feed([entry()], 1, 0, 0),
    feed([entry()], 0), feed(Array.from({ length: 11 }, () => entry()), 100, 0, 10), feed([entry(), entry()], 11, 10)]) {
    assert.throws(() => parseArxivSearchFeed(xml), CitationParseError);
  }
  for (const start of [-10, 1, 200, NaN, Infinity, '10']) assert.throws(() => parseArxivSearchFeed(feed(), start as number), TypeError);
});

test('search feeds reject malformed XML, HTML, DTDs, entities, API errors and oversized XML', () => {
  for (const xml of ['', '<html><body>Busy</body></html>', '<feed/>', `<feed xmlns="${atom}"><entry></feed>`,
    '<!DOCTYPE feed [<!ENTITY x SYSTEM "https://evil.example/">]>' + feed(), '<!ENTITY x "text">' + feed(),
    feed(['<entry><id>http://arxiv.org/api/errors#incorrect_search_query</id><title>Error</title></entry>']),
    'x'.repeat(MAX_CITATION_FEED_BYTES + 1), '文'.repeat(Math.ceil(MAX_CITATION_FEED_BYTES / 3))]) {
    assert.throws(() => parseArxivSearchFeed(xml), CitationParseError);
  }
});

test('Atom and OpenSearch prefixes may vary while their namespace URIs stay authoritative', () => {
  const xml = feed([entry()]).replaceAll('opensearch:', 'os:').replace('xmlns:opensearch=', 'xmlns:os=')
    .replace('<feed ', '<a:feed xmlns:a="' + atom + '" ').replace('</feed>', '</a:feed>');
  assert.equal(parseArxivSearchFeed(xml).papers.length, 1);
});
