import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { formatLabel, isLanguagePreference, localize, resolveLocale, translate } from '../src/i18n.ts';

interface Message { message: string; description?: string; }
type Catalog = Record<string, Message>;
const readProject = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const en = JSON.parse(readProject('public/_locales/en/messages.json')) as Catalog;
const zh = JSON.parse(readProject('public/_locales/zh_CN/messages.json')) as Catalog;

test('English is the explicit default independent of the browser language', () => {
  globalThis.chrome = { i18n: { getUILanguage: () => 'zh-CN' } } as unknown as typeof chrome;
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(translate('openArxiv'), 'Open arXiv');
  assert.equal(translate('openArxiv', 'zh_CN'), '打开 arXiv');
  assert.equal(resolveLocale('zh_CN', 'en-US'), 'zh_CN');
});

test('Follow browser resolves supported Chinese locales and falls back to English', () => {
  for (const locale of ['zh', 'zh-CN', 'zh_CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN']) {
    assert.equal(resolveLocale('auto', locale), 'zh_CN', locale);
  }
  for (const locale of ['en', 'en-US', 'en_GB', 'fr', 'de-DE', 'zh-TW', 'zh-Hant', '', 'unknown']) {
    assert.equal(resolveLocale('auto', locale), 'en', locale);
  }
});

test('language preference validation accepts the available choices only', () => {
  for (const language of ['en', 'zh_CN', 'auto']) assert.equal(isLanguagePreference(language), true);
  for (const language of [undefined, null, {}, 1, 'zh-CN', 'fr', 'constructor', '__proto__', '']) {
    assert.equal(isLanguagePreference(language), false);
  }
});

test('localized messages preserve substitutions literally and localize reading-format labels', () => {
  for (const [language, catalog] of [['en', en], ['zh_CN', zh]] as const) {
    const format = 'HTML $& $1';
    const expected = catalog.dockOpenCurrent!.message.replace('$1', () => format);
    assert.equal(translate('dockOpenCurrent', language, [format]), expected);
    assert.equal(formatLabel('abs', language), catalog.formatAbs!.message);
    assert.equal(formatLabel('pdf', language), catalog.formatPdf!.message);
    assert.equal(formatLabel('html', language), catalog.formatHtml!.message);
  }
});

test('repeated localization preserves matching text and attributes without DOM writes', () => {
  let writes = 0;
  let title = 'Open arXiv';
  const attributes = new Map([['data-i18n-aria-label', 'openArxiv'], ['aria-label', 'Open arXiv']]);
  const textNode = {
    getAttribute: () => 'openArxiv',
    get textContent() { return title; },
    set textContent(value: string) { title = value; writes++; },
  };
  const attributeNode = {
    getAttribute: (key: string) => attributes.get(key) ?? null,
    setAttribute: (key: string, value: string) => { attributes.set(key, value); writes++; },
  };
  const root = { querySelectorAll: (selector: string) => selector === '[data-i18n]' ? [textNode]
    : selector === '[data-i18n-aria-label]' ? [attributeNode] : [] } as unknown as ParentNode;
  localize(root, 'en');
  localize(root, 'en');
  assert.equal(writes, 0, 'A matching title and accessible label remain untouched');
  localize(root, 'zh_CN');
  assert.equal(title, '打开 arXiv');
  assert.equal(attributes.get('aria-label'), '打开 arXiv');
  assert.equal(writes, 2);
  localize(root, 'zh_CN');
  assert.equal(writes, 2, 'Rendering the same locale keeps the existing DOM');
  localize(root, 'en');
  assert.equal(title, 'Open arXiv');
  assert.equal(attributes.get('aria-label'), 'Open arXiv');
  assert.equal(writes, 4);
});

test('bundled locale catalogs have complete matching keys and substitution slots', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const [key, message] of Object.entries(en)) {
    assert.ok(message.message.trim().length > 0, `English message ${key} is empty`);
    assert.ok(zh[key]!.message.trim().length > 0, `Chinese message ${key} is empty`);
    const slots = (value: string) => [...value.matchAll(/\$[1-9]/g)].map(([slot]) => slot).sort();
    assert.deepEqual(slots(zh[key]!.message), slots(message.message), `Placeholder mismatch: ${key}`);
  }
});

test('manifest and markup localization references exist in the English fallback catalog', () => {
  const manifestSource = readProject('public/manifest.json');
  const manifest = JSON.parse(manifestSource) as { default_locale: string };
  assert.equal(manifest.default_locale, 'en');
  for (const [, key] of manifestSource.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    assert.ok(en[key!], `Missing manifest message: ${key}`);
  }
  const sourceFiles = readdirSync(new URL('../src/', import.meta.url)).filter((file) => file.endsWith('.ts'));
  for (const file of ['public/popup.html', ...sourceFiles.map((file) => `src/${file}`)]) {
    const source = readProject(file);
    for (const [, key] of source.matchAll(/data-i18n(?:-title|-aria-label)?=["']([A-Za-z0-9_]+)["']/g)) {
      assert.ok(en[key!], `Missing markup message ${key} in ${file}`);
    }
  }
});
