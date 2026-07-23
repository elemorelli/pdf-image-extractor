import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const PUBLIC_DIR = 'public';
const OUT_DIR = join(PUBLIC_DIR, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = readdirSync(PUBLIC_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(PUBLIC_DIR, name));

if (entryPoints.length === 0) {
  console.log('No frontend .ts entry points found, skipping bundle.');
  process.exit(0);
}

const buildOptions = {
  entryPoints,
  outdir: OUT_DIR,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);

  await ctx.watch();
  console.log(`Watching ${entryPoints.length} frontend entry point(s) -> ${OUT_DIR}`);
} else {
  await esbuild.build(buildOptions);
  console.log(`Bundled ${entryPoints.length} frontend entry point(s) into ${OUT_DIR}`);
}
