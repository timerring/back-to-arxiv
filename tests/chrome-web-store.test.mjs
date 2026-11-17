import assert from 'node:assert/strict';
import test from 'node:test';
import { submitToStore } from '../scripts/chrome-web-store.mjs';

const config = {
  publisherId: 'publisher-123', extensionId: 'a'.repeat(32), version: '0.10.0',
  zip: Buffer.from('package'), clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh',
};
const revision = (state, version) => ({ state, distributionChannels: [{ crxVersion: version }] });
function mock(responses) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    calls.push({ url, ...options });
    assert.ok(responses.length, 'Unexpected request');
    const next = responses.shift();
    return { ok: !next.http, status: next.http ?? 200, json: async () => next };
  }, sleep: async () => {}, log: () => {} };
}

test('upload is processed before submitting with automatic publication and normal review', async () => {
  const api = mock([{ access_token: 'access' }, {}, { uploadState: 'IN_PROGRESS' },
    { lastAsyncUploadState: 'SUCCEEDED' }, { state: 'PENDING_REVIEW' }]);
  assert.deepEqual(await submitToStore(config, api), { state: 'PENDING_REVIEW', skipped: false });
  assert.equal(api.calls[2].body, config.zip);
  assert.match(api.calls[2].url, /\/upload\/v2\/publishers\/publisher-123\/items\/a+:upload$/);
  assert.equal(api.calls[3].method, undefined);
  assert.deepEqual(JSON.parse(api.calls[4].body), { publishType: 'DEFAULT_PUBLISH', skipReview: false });
});

test('failed, unknown and timed-out uploads never publish', async () => {
  for (const state of ['FAILED', 'NOT_FOUND', undefined]) {
    const api = mock([{ access_token: 'access' }, {}, { uploadState: state }]);
    await assert.rejects(submitToStore(config, api), /Upload did not succeed/);
    assert.equal(api.calls.length, 3);
  }
  const api = mock([{ access_token: 'access' }, {}, { uploadState: 'IN_PROGRESS' },
    ...Array.from({ length: 30 }, () => ({ lastAsyncUploadState: 'IN_PROGRESS' }))]);
  await assert.rejects(submitToStore(config, api), /Upload did not succeed/);
  assert.equal(api.calls.some((call) => call.url.endsWith(':publish')), false);
});

test('reruns skip the same published or pending version without uploading', async () => {
  for (const [field, state] of [['publishedItemRevisionStatus', 'PUBLISHED'], ['submittedItemRevisionStatus', 'PENDING_REVIEW']]) {
    const api = mock([{ access_token: 'access' }, { [field]: revision(state, config.version) }]);
    assert.equal((await submitToStore(config, api)).skipped, true);
    assert.equal(api.calls.length, 2);
  }
});

test('another pending revision or staged revision is never overwritten', async () => {
  for (const state of ['PENDING_REVIEW', 'STAGED']) {
    const api = mock([{ access_token: 'access' }, { submittedItemRevisionStatus: revision(state, '0.9.0') }]);
    await assert.rejects(submitToStore(config, api), /already under review or staged/);
    assert.equal(api.calls.length, 2);
  }
});

test('missing credentials fail before network calls and HTTP errors do not leak response bodies', async () => {
  const api = mock([]);
  await assert.rejects(submitToStore({ ...config, refreshToken: '' }, api), /Configure CWS/);
  assert.equal(api.calls.length, 0);
  const denied = mock([{ http: 401, error_description: 'secret credential' }]);
  await assert.rejects(submitToStore(config, denied), (error) => /HTTP 401/.test(error.message) && !error.message.includes('secret credential'));
});

test('wrong uploaded version and rejected publication fail visibly', async () => {
  const mismatch = mock([{ access_token: 'access' }, {}, { uploadState: 'SUCCEEDED', crxVersion: '0.9.0' }]);
  await assert.rejects(submitToStore(config, mismatch), /does not match/);
  const rejected = mock([{ access_token: 'access' }, {}, { uploadState: 'SUCCEEDED', crxVersion: config.version }, { state: 'REJECTED' }]);
  await assert.rejects(submitToStore(config, rejected), /REJECTED/);
});
