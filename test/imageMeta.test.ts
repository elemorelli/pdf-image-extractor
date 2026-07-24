import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readImageMeta, readImageMetaForFiles } from '../server/imageMeta.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..');
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('readImageMeta reads width, height, and size from a PNG', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-meta-png-'));

  fs.writeFileSync(path.join(dir, 'one.png'), TINY_PNG);

  const meta = await readImageMeta(dir, 'one.png');

  assert.deepEqual(meta, { filename: 'one.png', size: TINY_PNG.length, width: 1, height: 1 });
});

test('readImageMeta reads width, height, and size from a WebP', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-meta-webp-'));

  fs.writeFileSync(path.join(dir, 'one.png'), TINY_PNG);
  execFileSync(path.join(REPO_ROOT, 'webp_convert.sh'), ['--apply', dir], { encoding: 'utf8' });

  const stat = fs.statSync(path.join(dir, 'one.webp'));
  const meta = await readImageMeta(dir, 'one.webp');

  assert.deepEqual(meta, { filename: 'one.webp', size: stat.size, width: 1, height: 1 });
});

test('readImageMeta omits width/height for an unreadable header but still reports size', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-meta-bad-'));

  fs.writeFileSync(path.join(dir, 'broken.png'), 'not-an-image');

  const meta = await readImageMeta(dir, 'broken.png');

  assert.deepEqual(meta, { filename: 'broken.png', size: 'not-an-image'.length });
});

test('readImageMetaForFiles reads metadata for every filename given', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-meta-many-'));

  fs.writeFileSync(path.join(dir, 'a.png'), TINY_PNG);
  fs.writeFileSync(path.join(dir, 'b.png'), TINY_PNG);

  const metas = await readImageMetaForFiles(dir, ['a.png', 'b.png']);

  assert.deepEqual(metas, [
    { filename: 'a.png', size: TINY_PNG.length, width: 1, height: 1 },
    { filename: 'b.png', size: TINY_PNG.length, width: 1, height: 1 },
  ]);
});
