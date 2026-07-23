import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidJobId, isValidSubfolder, isValidFilename } from '../server/validate.ts';

test('accepts a valid v4 UUID as jobId', () => {
  assert.equal(isValidJobId('2f6a4c8e-1b2d-4e3f-8a9b-0c1d2e3f4a5b'), true);
});

test('rejects a non-UUID jobId', () => {
  assert.equal(isValidJobId('../../etc/passwd'), false);
  assert.equal(isValidJobId(''), false);
  assert.equal(isValidJobId(undefined), false);
});

test('accepts only transparent or opaque as subfolder', () => {
  assert.equal(isValidSubfolder('transparent'), true);
  assert.equal(isValidSubfolder('opaque'), true);
  assert.equal(isValidSubfolder('../secrets'), false);
  assert.equal(isValidSubfolder('opaque/../transparent'), false);
});

test('accepts plain png/webp filenames', () => {
  assert.equal(isValidFilename('image-01.png'), true);
  assert.equal(isValidFilename('image-01.webp'), true);
});

test('rejects filenames with path traversal or separators', () => {
  assert.equal(isValidFilename('../../etc/passwd.png'), false);
  assert.equal(isValidFilename('sub/dir.png'), false);
  assert.equal(isValidFilename('..png'), false);
  assert.equal(isValidFilename('image.txt'), false);
});
