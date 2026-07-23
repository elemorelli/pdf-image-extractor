import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseProgressLine } from '../server/progressParser.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..');
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('webp_convert.sh converts across multiple directories with one combined progress count', () => {
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-a-'));
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-b-'));

  fs.writeFileSync(path.join(dir1, 'one.png'), TINY_PNG);
  fs.writeFileSync(path.join(dir2, 'two.png'), TINY_PNG);
  fs.writeFileSync(path.join(dir2, 'three.png'), TINY_PNG);

  const stdout = execFileSync(path.join(REPO_ROOT, 'webp_convert.sh'), ['--apply', dir1, dir2], {
    encoding: 'utf8',
  });

  const progressLines = stdout.split('\n').map(parseProgressLine).filter(Boolean);

  assert.ok(progressLines.length > 0, 'expected at least one progress line');
  const last = progressLines[progressLines.length - 1];

  assert.equal(last?.stage, 'webp');
  assert.equal(last?.total, 3);
  assert.equal(last?.done, 3);

  assert.ok(fs.existsSync(path.join(dir1, 'one.webp')));
  assert.ok(fs.existsSync(path.join(dir2, 'two.webp')));
  assert.ok(fs.existsSync(path.join(dir2, 'three.webp')));
  assert.ok(!fs.existsSync(path.join(dir1, 'one.png')));

  fs.rmSync(dir1, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('webp_convert.sh dry-run leaves originals in place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp-dryrun-'));

  fs.writeFileSync(path.join(dir, 'one.png'), TINY_PNG);

  execFileSync(path.join(REPO_ROOT, 'webp_convert.sh'), [dir], { encoding: 'utf8' });

  assert.ok(fs.existsSync(path.join(dir, 'one.png')));
  assert.ok(!fs.existsSync(path.join(dir, 'one.webp')));

  fs.rmSync(dir, { recursive: true, force: true });
});
