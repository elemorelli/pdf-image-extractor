import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJobStore } from '../server/jobStore.ts';
import { sweepExpiredJobs } from '../server/cleanup.ts';

const tempBaseDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-'));

test('deletes jobs older than maxAgeMs and keeps newer ones', async () => {
  const store = createJobStore(tempBaseDir());
  const now = Date.parse('2026-07-23T12:00:00.000Z');

  const oldJob = await store.createJob({ originalName: 'old.pdf', webp: false });

  await store.updateJob(oldJob, { uploadedAt: '2026-07-22T00:00:00.000Z' }); // 36h old

  const newJob = await store.createJob({ originalName: 'new.pdf', webp: false });

  await store.updateJob(newJob, { uploadedAt: '2026-07-23T10:00:00.000Z' }); // 2h old

  const deleted = await sweepExpiredJobs(store, { maxAgeMs: 24 * 60 * 60 * 1000, now });

  assert.deepEqual(deleted, [oldJob]);
  assert.equal(await store.getJob(oldJob), null);
  assert.ok(await store.getJob(newJob));
});

test('deletes nothing when no jobs are older than maxAgeMs', async () => {
  const store = createJobStore(tempBaseDir());
  const now = Date.parse('2026-07-23T12:00:00.000Z');
  const jobId = await store.createJob({ originalName: 'fresh.pdf', webp: false });

  await store.updateJob(jobId, { uploadedAt: '2026-07-23T11:00:00.000Z' });

  const deleted = await sweepExpiredJobs(store, { maxAgeMs: 24 * 60 * 60 * 1000, now });

  assert.deepEqual(deleted, []);
});
