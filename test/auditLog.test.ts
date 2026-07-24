import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAuditLog } from '../server/auditLog.ts';

test('log() appends a JSON line with the event fields and a timestamp', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditlog-'));
  const auditLog = createAuditLog(dir);

  await auditLog.log({ type: 'created', jobId: 'abc-123', originalName: 'x.pdf' });
  await auditLog.log({ type: 'done', jobId: 'abc-123', originalName: 'x.pdf' });
  await auditLog.close();

  const contents = fs.readFileSync(path.join(dir, 'app.log'), 'utf8');
  const lines = contents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

  assert.equal(lines.length, 2);
  assert.equal(lines[0].type, 'created');
  assert.equal(lines[0].jobId, 'abc-123');
  assert.ok(lines[0].time);
  assert.equal(lines[1].type, 'done');
});
