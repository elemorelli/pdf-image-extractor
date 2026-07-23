import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressLine } from '../server/progressParser.ts';

test('parses a valid progress line with done/total', () => {
  const result = parseProgressLine('##PROGRESS##{"stage":"extract","done":42,"total":173}');

  assert.deepEqual(result, { stage: 'extract', done: 42, total: 173 });
});

test('parses a stage-only line with no done/total', () => {
  const result = parseProgressLine('##PROGRESS##{"stage":"structure"}');

  assert.deepEqual(result, { stage: 'structure' });
});

test('returns null for a non-progress line', () => {
  assert.equal(parseProgressLine('* Reading image/mask structure'), null);
});

test('returns null for malformed JSON after the prefix', () => {
  assert.equal(parseProgressLine('##PROGRESS##{not json}'), null);
});

test('returns null when the stage field is missing', () => {
  assert.equal(parseProgressLine('##PROGRESS##{"done":1,"total":2}'), null);
});

test('parses a progress line preceded by an unterminated \\r counter', () => {
  // pdf_extract.sh prints `\r  1/1498 page-001.png` (no trailing newline)
  // immediately before emit_progress, so both land on the same raw line.
  const result = parseProgressLine(
    '\r  1/1498 page-001.png##PROGRESS##{"stage":"extract","done":1,"total":1498}',
  );

  assert.deepEqual(result, { stage: 'extract', done: 1, total: 1498 });
});
