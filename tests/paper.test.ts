import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArxivUrl, getPaperId, isPaperVersion, parsePaperUrl, type Paper, type PaperVersion, type ReadingFormat } from '../src/paper.ts';

test('all supported alphaXiv routes resolve to the same paper and preserve its version', () => {
  for (const host of ['alphaxiv.org', 'www.alphaxiv.org']) {
    for (const route of ['abs', 'pdf', 'html', 'overview']) {
      assert.deepEqual(parsePaperUrl(`https://${host}/${route}/1706.03762v7?utm_source=share#discussion`), {
        id: '1706.03762v7',
        source: 'alphaxiv',
      });
    }
  }
});

test('arXiv abstract, PDF and HTML URLs are recognized on both hostnames', () => {
  for (const host of ['arxiv.org', 'www.arxiv.org']) {
    for (const route of ['abs', 'pdf', 'html']) {
      assert.deepEqual(parsePaperUrl(`https://${host}/${route}/0706.0001`), {
        id: '0706.0001',
        source: 'arxiv',
      });
    }
  }
  assert.equal(parsePaperUrl('https://arxiv.org/overview/1706.03762'), null);
});

test('PDF suffixes, trailing slashes and historical identifiers preserve the original identifier', () => {
  for (const id of ['1706.03762v7', '0706.0001', 'hep-th/9901001v2', 'math.GT/0309136', 'quant-ph/0601001']) {
    assert.deepEqual(parsePaperUrl(`https://alphaxiv.org/pdf/${id}.pdf/`), { id, source: 'alphaxiv' });
    assert.deepEqual(parsePaperUrl(`https://arxiv.org/abs/${id}/`), { id, source: 'arxiv' });
  }
  assert.equal(parsePaperUrl('https://alphaxiv.org/abs/1706.03762.pdf'), null);
});

test('encoded legacy separators and PDF suffixes are decoded exactly once', () => {
  assert.deepEqual(parsePaperUrl('https://www.alphaxiv.org/pdf/math.GT%2F0309136v2%2Epdf'), {
    id: 'math.GT/0309136v2',
    source: 'alphaxiv',
  });
  assert.equal(parsePaperUrl('https://alphaxiv.org/abs/hep-th%252F9901001'), null);
  assert.equal(parsePaperUrl('https://alphaxiv.org/abs/%E0%A4%A'), null);
});

test('HTTP and explicit standard ports work; other protocols and ports are rejected', () => {
  for (const base of ['http://alphaxiv.org', 'http://alphaxiv.org:80', 'https://alphaxiv.org:443']) {
    assert.deepEqual(parsePaperUrl(`${base}/abs/1706.03762`), { id: '1706.03762', source: 'alphaxiv' });
  }
  for (const base of ['https://alphaxiv.org:8443', 'http://alphaxiv.org:443', 'ftp://alphaxiv.org']) {
    assert.equal(parsePaperUrl(`${base}/abs/1706.03762`), null);
  }
});

test('untrusted hosts, credentials and misleading URLs never produce a paper', () => {
  for (const value of [
    'https://alphaxiv.org.evil.example/abs/1706.03762',
    'https://evil-alphaxiv.org/abs/1706.03762',
    'https://sub.alphaxiv.org/abs/1706.03762',
    'https://example.com/abs/1706.03762',
    'https://alphaxiv.org@evil.example/abs/1706.03762',
    'https://user:password@alphaxiv.org/abs/1706.03762',
    'https://user@arxiv.org/abs/1706.03762',
    'javascript:https://alphaxiv.org/abs/1706.03762',
    '//alphaxiv.org/abs/1706.03762',
    '1706.03762',
    '',
  ]) {
    assert.equal(parsePaperUrl(value), null, value);
  }
});

test('only complete paper routes are accepted, including after SPA navigation', () => {
  for (const value of [
    'https://alphaxiv.org/',
    'https://alphaxiv.org/search?q=1706.03762',
    'https://alphaxiv.org/profile/1706.03762',
    'https://alphaxiv.org/?next=/abs/1706.03762',
    'https://alphaxiv.org/#/abs/1706.03762',
    'https://alphaxiv.org/abs/01a18793-04be-7270-8757-fe685667e616',
    'https://alphaxiv.org/abs/1706.03762/comments',
    'https://alphaxiv.org/abs/1706.03762//',
    'https://alphaxiv.org/abs/1706.03762%00',
    'https://alphaxiv.org/abs/1706.03762%3Fversion=2',
  ]) {
    assert.equal(parsePaperUrl(value), null, value);
  }
  assert.equal(parsePaperUrl('https://alphaxiv.org/abs/1706.03762')?.id, '1706.03762');
  assert.equal(parsePaperUrl('https://alphaxiv.org/abs/2303.08774v2')?.id, '2303.08774v2');
});

test('malformed identifiers and versions are rejected', () => {
  for (const id of [
    '1700.03762', '1713.03762', '17.03762', '1706.123', '1706.123456',
    '1706.03762v0', '1706.03762v01', '1706.03762v', '1706.03762V2',
    'hep-th/9913001', 'hep-th/9900001', 'hep-th/990100', 'hep-th/99010012',
    'hep-th/9901001v0', 'math.gt/0309136', '1706.03762.pdf.exe',
  ]) {
    assert.equal(parsePaperUrl(`https://alphaxiv.org/abs/${id}`), null, id);
  }
});

test('canonical URLs keep explicit versions and drop source tracking and fragments', () => {
  const paper = parsePaperUrl('https://www.alphaxiv.org/overview/1706.03762v7?utm_source=share#page=4');
  assert.ok(paper);
  assert.equal(buildArxivUrl(paper, 'abs'), 'https://arxiv.org/abs/1706.03762v7');
  assert.equal(buildArxivUrl(paper, 'pdf'), 'https://arxiv.org/pdf/1706.03762v7');
  assert.equal(buildArxivUrl(paper, 'html'), 'https://arxiv.org/html/1706.03762v7');

  const legacyPaper = parsePaperUrl('https://alphaxiv.org/pdf/hep-th/9901001v2.pdf');
  assert.ok(legacyPaper);
  assert.equal(buildArxivUrl(legacyPaper, 'pdf'), 'https://arxiv.org/pdf/hep-th/9901001v2');
  assert.equal(buildArxivUrl(legacyPaper, 'html'), 'https://arxiv.org/html/hep-th/9901001v2');
});

test('HTML destinations preserve explicit and implicit version selection', () => {
  for (const id of ['1706.03762', '1706.03762v7', 'hep-th/9901001v2']) {
    const paper = parsePaperUrl(`https://www.alphaxiv.org/overview/${id}?utm_source=reader#discussion`);
    assert.ok(paper);
    assert.equal(buildArxivUrl(paper, 'html'), `https://arxiv.org/html/${id}`);
  }
});

test('URL generation validates its inputs at the trusted navigation boundary', () => {
  const paper: Paper = { id: '1706.03762', source: 'alphaxiv' };
  assert.throws(() => buildArxivUrl({ ...paper, id: '../search' }, 'abs'), TypeError);
  assert.throws(() => buildArxivUrl({ ...paper, id: '1706.03762?redirect=evil' }, 'abs'), TypeError);
  assert.throws(() => buildArxivUrl(paper, 'overview' as ReadingFormat), TypeError);
  assert.throws(() => buildArxivUrl(null as unknown as Paper, 'abs'), TypeError);
  assert.throws(() => buildArxivUrl(paper, 'abs', 'v3' as PaperVersion), TypeError);
});

test('latest version URLs remove only the explicit version across formats and identifier schemes', () => {
  for (const [id, latestId] of [
    ['1706.03762v7', '1706.03762'],
    ['0706.0001v123', '0706.0001'],
    ['hep-th/9901001v2', 'hep-th/9901001'],
    ['math.GT/0309136v12', 'math.GT/0309136'],
    ['1706.03762', '1706.03762'],
    ['math.GT/0309136', 'math.GT/0309136'],
  ]) {
    const paper: Paper = { id: id!, source: 'alphaxiv' };
    for (const format of ['abs', 'pdf', 'html'] as const) {
      assert.equal(buildArxivUrl(paper, format, 'latest'), `https://arxiv.org/${format}/${latestId}`);
      assert.equal(buildArxivUrl(paper, format, 'current'), `https://arxiv.org/${format}/${id}`);
      assert.equal(buildArxivUrl(paper, format), `https://arxiv.org/${format}/${id}`);
    }
    assert.equal(getPaperId(paper, 'latest'), latestId);
    assert.equal(getPaperId(paper), id);
    assert.equal(paper.id, id, 'Version selection keeps the parsed source identifier intact');
  }
});

test('version selection accepts only the two supported policies', () => {
  assert.equal(isPaperVersion('current'), true);
  assert.equal(isPaperVersion('latest'), true);
  for (const value of [undefined, null, false, '', 'v3', 'LATEST', {}, 'constructor']) {
    assert.equal(isPaperVersion(value), false);
  }
  assert.throws(() => getPaperId({ id: '1706.03762v0', source: 'arxiv' }, 'latest'), TypeError);
});
