import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeBatch, buildBatchMarkdown, MAX_BATCH_CHARACTERS, MAX_BATCH_REFERENCES } from '../src/batch.ts';
import type { PaperVersion } from '../src/paper.ts';

test('mixed references produce an ordered, clean Markdown reading list and report duplicate source lines', () => {
  const result = analyzeBatch([
    'https://www.alphaxiv.org/overview/1706.03762v3?utm_source=share#discussion',
    '[Attention](https://arxiv.org/pdf/1706.03762v3.pdf)',
    'doi:10.48550/arXiv.2301.12345',
    'not a paper',
    'arXiv:hep-th/9901001v2',
    '<https://arxiv.org/abs/2301.12345>',
  ].join('\n'));
  assert.equal(result.error, null);
  assert.equal(result.papers.length, 3);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(result.entries.map((entry) => entry.status), ['valid', 'duplicate', 'valid', 'invalid', 'valid', 'duplicate']);
  assert.deepEqual(result.entries.filter((entry) => entry.status === 'duplicate').map((entry) => entry.duplicateOf), [1, 3]);
  assert.equal(buildBatchMarkdown(result), [
    '- [arXiv:1706.03762v3](https://arxiv.org/abs/1706.03762v3)',
    '- [arXiv:2301.12345](https://arxiv.org/abs/2301.12345)',
    '- [arXiv:hep-th/9901001v2](https://arxiv.org/abs/hep-th/9901001v2)',
    '',
  ].join('\n'));
});

test('current-version deduplication retains explicit versions and unversioned references separately', () => {
  const result = analyzeBatch('1706.03762v2\n1706.03762v3\n10.48550/arXiv.1706.03762\nhttps://arxiv.org/abs/1706.03762v2');
  assert.equal(result.version, 'current');
  assert.deepEqual(result.papers.map((paper) => paper.id), ['1706.03762v2', '1706.03762v3', '1706.03762']);
  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(result.entries[3], { lineNumber: 4, input: 'https://arxiv.org/abs/1706.03762v2', status: 'duplicate', paper: { id: '1706.03762v2', source: 'arxiv' }, id: '1706.03762v2', duplicateOf: 1 });
});

test('latest-version deduplication merges versions across URLs, IDs, and DOI input', () => {
  const result = analyzeBatch('1706.03762v3\n1706.03762v2\n10.48550/arXiv.1706.03762\nhep-th/9901001v2\nhttps://arxiv.org/pdf/hep-th/9901001v4.pdf', 'latest');
  assert.equal(result.version, 'latest');
  assert.deepEqual(result.entries.filter((entry) => entry.status !== 'invalid').map((entry) => entry.id), ['1706.03762', '1706.03762', '1706.03762', 'hep-th/9901001', 'hep-th/9901001']);
  assert.deepEqual(result.papers.map((paper) => paper.id), ['1706.03762v3', 'hep-th/9901001v2'], 'The source papers stay intact');
  assert.equal(result.duplicateCount, 3);
  assert.equal(buildBatchMarkdown(result), '- [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)\n- [arXiv:hep-th/9901001](https://arxiv.org/abs/hep-th/9901001)\n');
});

test('blank lines are ignored while CRLF and CR line numbers remain tied to the original input', () => {
  const result = analyzeBatch('\r\n  1706.03762  \r\n\t\r\nwrong\r1706.03762\n');
  assert.deepEqual(result.entries.map((entry) => [entry.lineNumber, entry.input, entry.status]), [
    [2, '1706.03762', 'valid'], [4, 'wrong', 'invalid'], [5, '1706.03762', 'duplicate'],
  ]);
  assert.equal(result.entries[2]?.status === 'duplicate' && result.entries[2].duplicateOf, 2);
});

test('common Markdown list markers parse once and exports can be pasted back', () => {
  const result = analyzeBatch([
    '  - [A](https://arxiv.org/abs/1706.03762v3)',
    '* arXiv:2301.12345',
    '+ https://arxiv.org/pdf/hep-th/9901001v2.pdf',
    '10. https://doi.org/10.48550/arXiv.math.gt/0309136',
    '2) <https://arxiv.org/abs/0706.0001>',
  ].join('\n'));
  assert.equal(result.invalidCount, 0);
  assert.equal(result.entries[0]?.input, '- [A](https://arxiv.org/abs/1706.03762v3)');
  const exported = buildBatchMarkdown(result);
  const reimported = analyzeBatch(exported);
  assert.equal(buildBatchMarkdown(reimported), exported);
  assert.equal(reimported.papers.length, 5);
  assert.equal(reimported.duplicateCount, 0);
  for (const input of ['- - 1706.03762', '1. - 1706.03762', '> 1706.03762', '-1706.03762', '1.1706.03762']) {
    assert.equal(analyzeBatch(input).invalidCount, 1, input);
  }
});

test('hostile references, prose and multiple references on one line remain errors without polluting export', () => {
  const invalid = [
    '[1706.03762](https://arxiv.org.evil.example/abs/1706.03762)',
    '[paper](javascript:alert(1))',
    '<img src=x onerror=alert(1)>',
    'Read arXiv:1706.03762',
    '1706.03762 2301.12345',
    '[one](https://arxiv.org/abs/1706.03762) [two](https://arxiv.org/abs/2301.12345)',
    '10.48550/arXiv.1706.03762v3',
    'https://doi.org/10.1000/arXiv.1706.03762',
    'https://user:password@arxiv.org/abs/1706.03762',
  ];
  const result = analyzeBatch(['2301.12345', ...invalid, '1706.03762'].join('\n'));
  assert.equal(result.invalidCount, invalid.length);
  assert.equal(result.duplicateCount, 0);
  assert.equal(buildBatchMarkdown(result), '- [arXiv:2301.12345](https://arxiv.org/abs/2301.12345)\n- [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)\n');
});

test('Markdown labels never become exported titles or alter the destination paper', () => {
  const result = analyzeBatch('[arXiv:2301.12345 <script>alert(1)</script>](https://arxiv.org/abs/1706.03762)');
  assert.equal(buildBatchMarkdown(result), '- [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)\n');
});

test('empty and entirely invalid input export an empty string', () => {
  for (const input of ['', ' \t\r\n\n ', 'bad\nwrong']) {
    const result = analyzeBatch(input);
    assert.equal(result.error, null);
    assert.equal(buildBatchMarkdown(result), '');
    assert.equal(result.papers.length, 0);
  }
});

test('a batch at the reference limit is accepted and a larger batch fails without partial output', () => {
  const references = Array.from({ length: MAX_BATCH_REFERENCES }, () => '1706.03762');
  const accepted = analyzeBatch(`\n${references.join('\n\n')}\n`);
  assert.equal(accepted.error, null);
  assert.equal(accepted.entries.length, MAX_BATCH_REFERENCES);
  assert.equal(accepted.papers.length, 1);
  assert.equal(accepted.duplicateCount, MAX_BATCH_REFERENCES - 1);
  const rejected = analyzeBatch([...references, '2301.12345'].join('\n'));
  assert.equal(rejected.error, 'tooManyReferences');
  assert.deepEqual(rejected.entries, []);
  assert.deepEqual(rejected.papers, []);
  assert.equal(rejected.duplicateCount, 0);
  assert.equal(rejected.invalidCount, 0);
  assert.equal(buildBatchMarkdown(rejected), '');
});

test('character limits include whitespace and reject oversize input without exporting a leading valid paper', () => {
  const prefix = '1706.03762\n';
  const boundary = prefix + ' '.repeat(MAX_BATCH_CHARACTERS - prefix.length);
  assert.equal(analyzeBatch(boundary).error, null);
  assert.equal(analyzeBatch(boundary).papers.length, 1);
  const rejected = analyzeBatch(`${boundary} `, 'latest');
  assert.equal(rejected.error, 'inputTooLong');
  assert.equal(rejected.version, 'latest');
  assert.deepEqual(rejected.entries, []);
  assert.deepEqual(rejected.papers, []);
  assert.equal(buildBatchMarkdown(rejected), '');
});

test('per-reference limits are still enforced inside an otherwise valid batch', () => {
  const result = analyzeBatch(`1706.03762\nhttps://arxiv.org/abs/2301.12345?tracking=${'a'.repeat(4096)}\nhep-th/9901001`);
  assert.equal(result.error, null);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.papers.length, 2);
  assert.equal(result.entries[1]?.lineNumber, 2);
});

test('invalid API input and unsupported version policies fail explicitly', () => {
  assert.throws(() => analyzeBatch(null as unknown as string), TypeError);
  for (const version of ['v3', '', 'LATEST', null]) {
    assert.throws(() => analyzeBatch('1706.03762', version as PaperVersion), TypeError);
  }
});
