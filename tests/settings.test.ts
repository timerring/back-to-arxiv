import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { DEFAULT_PREFERENCES, getPreferences, normalizePreferences, savePreferences } from '../src/settings.ts';

let stored: Record<string, unknown>;

beforeEach(() => {
  stored = {};
  globalThis.chrome = {
    i18n: { getUILanguage: () => 'zh-CN' },
    storage: { local: {
      get: async () => structuredClone(stored),
      set: async (value: Record<string, unknown>) => { Object.assign(stored, structuredClone(value)); },
    } },
  } as unknown as typeof chrome;
});

test('fresh installation uses English, abstract and current tab even on a Chinese browser', async () => {
  assert.deepEqual(await getPreferences(), { format: 'abs', openInNewTab: false, language: 'en', version: 'current' });
});

test('malformed stored settings recover individual valid fields', () => {
  for (const value of [null, undefined, 10, 'pdf', [], { format: 'unsupported', openInNewTab: 'false' }]) {
    assert.deepEqual(normalizePreferences(value), DEFAULT_PREFERENCES);
  }
  assert.deepEqual(normalizePreferences({ format: 'pdf', openInNewTab: 'true' }), { format: 'pdf', openInNewTab: false, language: 'en', version: 'current' });
  assert.deepEqual(normalizePreferences({ format: 'html', openInNewTab: 'true' }), { format: 'html', openInNewTab: false, language: 'en', version: 'current' });
  assert.deepEqual(normalizePreferences({ format: 'invalid', openInNewTab: true, language: 'en', version: 'current' }), { format: 'abs', openInNewTab: true, language: 'en', version: 'current' });
});

test('HTML preference survives storage and independent tab-mode changes', async () => {
  await savePreferences({ format: 'html' });
  assert.deepEqual(await getPreferences(), { format: 'html', openInNewTab: false, language: 'en', version: 'current' });
  await savePreferences({ openInNewTab: true });
  assert.deepEqual(await getPreferences(), { format: 'html', openInNewTab: true, language: 'en', version: 'current' });
  await savePreferences({ format: 'pdf' });
  assert.deepEqual(await getPreferences(), { format: 'pdf', openInNewTab: true, language: 'en', version: 'current' });
});

test('saving one preference preserves the other and survives a new read', async () => {
  stored.preferences = { format: 'pdf', openInNewTab: false }; // Migrate pre-i18n settings.
  await savePreferences({ openInNewTab: true });
  assert.deepEqual(await getPreferences(), { format: 'pdf', openInNewTab: true, language: 'en', version: 'current' });
  await savePreferences({ format: 'abs' });
  assert.deepEqual(await getPreferences(), { format: 'abs', openInNewTab: true, language: 'en', version: 'current' });
});

test('storage failures remain actionable to callers', async () => {
  chrome.storage.local.get = async () => { throw new Error('Storage unavailable'); };
  await assert.rejects(getPreferences, /Storage unavailable/);
  await assert.rejects(() => savePreferences({ format: 'pdf' }), /Storage unavailable/);
});


test('changing language preserves reading preferences and persists across reads', async () => {
  stored.preferences = { format: 'html', openInNewTab: true, language: 'en', version: 'current' };
  await savePreferences({ language: 'zh_CN', version: 'current' });
  assert.deepEqual(await getPreferences(), { format: 'html', openInNewTab: true, language: 'zh_CN', version: 'current' });
  await savePreferences({ language: 'auto', version: 'current' });
  assert.deepEqual(await getPreferences(), { format: 'html', openInNewTab: true, language: 'auto', version: 'current' });
  await savePreferences({ format: 'pdf' });
  assert.deepEqual(await getPreferences(), { format: 'pdf', openInNewTab: true, language: 'auto', version: 'current' });
});

test('invalid or missing language migrates to English without losing valid format preferences', () => {
  for (const language of [undefined, null, 'zh-TW', 'fr', '', 7, {}, 'constructor']) {
    assert.deepEqual(normalizePreferences({ format: 'html', openInNewTab: true, language }), {
      format: 'html', openInNewTab: true, language: 'en', version: 'current',
    });
  }
});

test('v0.3 settings migrate to current version while preserving all prior preferences', async () => {
  stored.preferences = { format: 'html', openInNewTab: true, language: 'zh_CN' };
  assert.deepEqual(await getPreferences(), {
    format: 'html', openInNewTab: true, language: 'zh_CN', version: 'current',
  });
  await savePreferences({ version: 'latest' });
  await savePreferences({ format: 'pdf' });
  assert.deepEqual(await getPreferences(), {
    format: 'pdf', openInNewTab: true, language: 'zh_CN', version: 'latest',
  });
  await savePreferences({ version: 'current' });
  assert.equal((await getPreferences()).version, 'current');
});

test('invalid version settings recover current while retaining the other fields', () => {
  for (const version of [undefined, null, '', 'v3', 'LATEST', 3, {}, 'constructor']) {
    assert.deepEqual(normalizePreferences({ format: 'pdf', openInNewTab: true, language: 'auto', version }), {
      format: 'pdf', openInNewTab: true, language: 'auto', version: 'current',
    });
  }
});
