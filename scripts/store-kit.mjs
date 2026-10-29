import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const release = join(root, 'release');
const { name, version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const uploadName = `${name}-${version}.zip`;
const kitName = `${name}-${version}-store-kit.zip`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

const upload = await readFile(join(release, uploadName));
const checksum = await readFile(join(release, `${uploadName}.sha256`), 'utf8');
assert.equal(checksum.trim(), `${digest(upload)}  ${uploadName}`, 'Upload ZIP must match its checksum');
assert.deepEqual(await readFile(join(root, 'store/assets/icon-128.png')), await readFile(join(root, 'dist/icons/icon-128.png')), 'Regenerate store assets to use the current extension icon');
for (const [file, width, height] of [
  ['showcase-en.png', 1280, 800], ['showcase-zh-CN.png', 1280, 800], ['promo-small.png', 440, 280],
]) {
  const bytes = await readFile(join(root, 'store/assets', file));
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
  assert.equal(bytes[25], 2, `${file} must be an opaque RGB PNG`);
}

await mkdir(release, { recursive: true });
const staging = await mkdtemp(join(release, '.store-kit-'));
const inputs = [
  'START-HERE.txt', 'listing-en.txt', 'listing-zh-CN.txt',
  'reviewer-instructions.txt', 'privacy-practices.txt', 'privacy-policy.html',
];
const assets = ['icon-128.png', 'showcase-en.png', 'showcase-zh-CN.png', 'promo-small.png'];
try {
  const entries = [uploadName, `${uploadName}.sha256`, ...inputs.map((file) => `store/${file}`), ...assets.map((file) => `store/assets/${file}`)];
  await cp(join(release, uploadName), join(staging, uploadName));
  await cp(join(release, `${uploadName}.sha256`), join(staging, `${uploadName}.sha256`));
  await mkdir(join(staging, 'store/assets'), { recursive: true });
  for (const file of [...inputs, ...assets.map((file) => `assets/${file}`)]) {
    await cp(join(root, 'store', file), join(staging, 'store', file));
  }
  const archive = join(staging, kitName);
  run('zip', ['-q', '-X', archive, ...entries], staging);
  run('unzip', ['-tqq', archive], root);
  assert.deepEqual(run('unzip', ['-Z1', archive], root).trim().split('\n').sort(), entries.sort());
  const bytes = await readFile(archive);
  await rename(archive, join(release, kitName));
  await writeFile(join(release, `${kitName}.sha256`), `${digest(bytes)}  ${kitName}\n`);
  console.log(`Store submission kit: ${join(release, kitName)} (${bytes.length} bytes)`);
  console.log(`Upload ${uploadName} as the extension; use the kit's other files in the listing fields.`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
