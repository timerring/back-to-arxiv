import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { generateIcons } from './icons.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = join(root, 'dist');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(join(root, 'public'), outdir, { recursive: true });
await generateIcons(join(outdir, 'icons'));
await build({
  absWorkingDir: root,
  entryPoints: ['src/background.ts', 'src/content.ts', 'src/popup.ts'],
  bundle: true,
  outdir,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  legalComments: 'none',
  logLevel: 'info',
});
console.log(`Chrome extension ready: ${outdir}`);
