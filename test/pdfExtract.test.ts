import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseProgressLine, type ProgressUpdate } from '../server/progressParser.ts';

const REPO_ROOT = path.join(import.meta.dirname, '..');
const SAMPLE_PDF = path.join(REPO_ROOT, 'test.pdf');

test('pdf_extract.sh --outdir writes output directly into the given directory and emits progress', () => {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-extract-test-'));

  const stdout = execFileSync(
    path.join(REPO_ROOT, 'pdf_extract.sh'),
    ['--webp', '--outdir', outdir, SAMPLE_PDF],
    { encoding: 'utf8' },
  );

  const progressLines = stdout
    .split('\n')
    .map(parseProgressLine)
    .filter((p): p is ProgressUpdate => p !== null);
  const stages = new Set(progressLines.map((p) => p.stage));
  for (const expected of [
    'structure',
    'extract',
    'convert',
    'purge',
    'composite',
    'dedupe',
    'webp',
  ]) {
    assert.ok(stages.has(expected), `expected a "${expected}" progress line`);
  }

  assert.ok(fs.existsSync(path.join(outdir, 'transparent')));
  assert.ok(fs.existsSync(path.join(outdir, 'opaque')));

  const transparentFiles = fs.readdirSync(path.join(outdir, 'transparent'));
  const opaqueFiles = fs.readdirSync(path.join(outdir, 'opaque'));
  const allFiles = [...transparentFiles, ...opaqueFiles];
  assert.ok(allFiles.length > 0, 'expected at least one extracted image');
  assert.ok(
    allFiles.every((f) => f.endsWith('.webp')),
    'expected images converted to webp',
  );

  fs.rmSync(outdir, { recursive: true, force: true });
});

test('pdf_extract.sh without --outdir keeps the basename-derived folder behavior', () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-extract-cwd-'));
  execFileSync(path.join(REPO_ROOT, 'pdf_extract.sh'), [SAMPLE_PDF], {
    encoding: 'utf8',
    cwd: workdir,
  });

  assert.ok(fs.existsSync(path.join(workdir, 'test', 'transparent')));
  assert.ok(fs.existsSync(path.join(workdir, 'test', 'opaque')));

  fs.rmSync(workdir, { recursive: true, force: true });
});
