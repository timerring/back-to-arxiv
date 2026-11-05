import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { METADATA_ORIGIN } from '../src/metadata-protocol.ts';

test('metadata access is optional and limited to the official API without expanding required permissions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.optional_host_permissions, [METADATA_ORIGIN]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'clipboardWrite', 'contextMenus']);
});
