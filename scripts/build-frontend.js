import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const PUBLIC_DIR = 'public';
const OUT_DIR = join(PUBLIC_DIR, 'dist');

const entryPoints = readdirSync(PUBLIC_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(PUBLIC_DIR, name));

if (entryPoints.length === 0) {
  console.log('No frontend .ts entry points found, skipping bundle.');
  process.exit(0);
}

await esbuild.build({
  entryPoints,
  outdir: OUT_DIR,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
});

console.log(`Bundled ${entryPoints.length} frontend entry point(s) into ${OUT_DIR}`);
