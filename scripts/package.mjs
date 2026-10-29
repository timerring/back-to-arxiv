import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const release = join(root, 'release');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`Install the ${command} command to create and verify the store package. macOS includes zip and unzip.`);
  }
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), `${relative}/`));
    else {
      assert.ok(entry.isFile(), `Package entries must be regular files: ${relative}`);
      files.push(relative);
    }
  }
  return files.sort();
}

const manifest = await readJson(join(dist, 'manifest.json'));
const project = await readJson(join(root, 'package.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, project.version, 'Manifest and package versions must match');
assert.match(manifest.version, /^\d+(?:\.\d+){0,3}$/);
assert.equal(manifest.default_locale, 'en', 'English is the default store locale');
for (const field of ['name', 'description', 'version']) {
  assert.ok(typeof manifest[field] === 'string' && manifest[field].length > 0, `Manifest ${field} is required`);
}

const files = await listFiles(dist);
const allowedAsset = /^(?:manifest\.json|(?:background|content|popup)\.js|popup\.(?:html|css)|_locales\/[A-Za-z_]+\/messages\.json|icons\/icon-\d+\.png)$/;
for (const file of files) assert.match(file, allowedAsset, `Unexpected build artifact: ${file}`);
const requireAsset = (file) => assert.ok(files.includes(file), `Missing extension asset: ${file}`);
requireAsset('popup.css');
requireAsset('popup.js');
requireAsset(`_locales/${manifest.default_locale}/messages.json`);
requireAsset(manifest.action?.default_popup);
requireAsset(manifest.background?.service_worker);
for (const file of Object.values(manifest.icons ?? {})) requireAsset(file);
for (const file of Object.values(manifest.action?.default_icon ?? {})) requireAsset(file);
for (const script of manifest.content_scripts ?? []) {
  for (const file of [...script.js ?? [], ...script.css ?? []]) requireAsset(file);
}

const fallback = await readJson(join(dist, `_locales/${manifest.default_locale}/messages.json`));
const references = [...JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((match) => match[1]);
for (const key of references) assert.ok(fallback[key]?.message, `Missing default manifest translation: ${key}`);
for (const file of files.filter((path) => path.startsWith('_locales/'))) {
  const catalog = await readJson(join(dist, file));
  const resolve = (value) => value.replace(/__MSG_([A-Za-z0-9_]+)__/g, (_match, key) => catalog[key]?.message ?? fallback[key]?.message ?? '');
  const description = resolve(manifest.description);
  assert.ok(description.length > 0 && description.length <= 132, `${file}: description must be 1–132 characters`);
  assert.equal(resolve(manifest.name), 'Back to arXiv', `${file}: extension name must match the store listing`);
}

await mkdir(release, { recursive: true });
const staging = await mkdtemp(join(release, '.package-'));
const filename = `${project.name}-${manifest.version}.zip`;
const stagedArchive = join(staging, filename);
const archive = join(release, filename);
try {
  // Explicit relative entries place manifest.json at the ZIP root and exclude tooling.
  run('zip', ['-q', '-X', stagedArchive, ...files], dist);
  const entries = run('unzip', ['-Z1', stagedArchive], root).trim().split('\n').sort();
  assert.deepEqual(entries, files, 'Archive contents must match the validated runtime assets');
  run('unzip', ['-tqq', stagedArchive], root);
  assert.deepEqual(JSON.parse(run('unzip', ['-p', stagedArchive, 'manifest.json'], root)), manifest);
  const bytes = await readFile(stagedArchive);
  const digest = createHash('sha256').update(bytes).digest('hex');
  await rename(stagedArchive, archive);
  await writeFile(`${archive}.sha256`, `${digest}  ${filename}\n`);
  console.log(`Chrome Web Store package: ${archive}`);
  console.log(`Verified ${files.length} runtime files, ${bytes.length} bytes, manifest at ZIP root.`);
  console.log(`SHA-256: ${digest}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
