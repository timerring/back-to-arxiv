import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { DEFAULT_PREFERENCES, getPreferences, normalizePreferences, savePreferences } from '../src/settings.ts';

let stored: Record<string, unknown>;

beforeEach(() => {
  stored = {};
  globalThis.chrome = {
    storage: { local: {
      get: async () => structuredClone(stored),
      set: async (value: Record<string, unknown>) => { Object.assign(stored, structuredClone(value)); },
    } },
  } as unknown as typeof chrome;
});

test('fresh installation uses abstract in the current tab', async () => {
  assert.deepEqual(await getPreferences(), { format: 'abs', openInNewTab: false });
});

test('malformed stored settings recover individual valid fields', () => {
  for (const value of [null, undefined, 10, 'pdf', [], { format: 'unsupported', openInNewTab: 'false' }]) {
    assert.deepEqual(normalizePreferences(value), DEFAULT_PREFERENCES);
  }
  assert.deepEqual(normalizePreferences({ format: 'pdf', openInNewTab: 'true' }), { format: 'pdf', openInNewTab: false });
  assert.deepEqual(normalizePreferences({ format: 'html', openInNewTab: 'true' }), { format: 'html', openInNewTab: false });
  assert.deepEqual(normalizePreferences({ format: 'invalid', openInNewTab: true }), { format: 'abs', openInNewTab: true });
});

test('HTML preference survives storage and independent tab-mode changes', async () => {
  await savePreferences({ format: 'html' });
  assert.deepEqual(await getPreferences(), { format: 'html', openInNewTab: false });
  await savePreferences({ openInNewTab: true });
  assert.deepEqual(await getPreferences(), { format: 'html', openInNewTab: true });
  await savePreferences({ format: 'pdf' });
  assert.deepEqual(await getPreferences(), { format: 'pdf', openInNewTab: true });
});

test('saving one preference preserves the other and survives a new read', async () => {
  stored.preferences = { format: 'pdf', openInNewTab: false };
  await savePreferences({ openInNewTab: true });
  assert.deepEqual(await getPreferences(), { format: 'pdf', openInNewTab: true });
  await savePreferences({ format: 'abs' });
  assert.deepEqual(await getPreferences(), { format: 'abs', openInNewTab: true });
});

test('storage failures remain actionable to callers', async () => {
  chrome.storage.local.get = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(getPreferences, /Storage unavailable/);
  await assert.rejects(() => savePreferences({ format: 'pdf' }), /Storage unavailable/);
});
