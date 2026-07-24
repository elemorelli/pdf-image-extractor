import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJobStore } from '../server/jobStore.ts';

function tempBaseDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jobstore-'));
}

test('createJob writes metadata.json with status processing', async () => {
  const store = createJobStore(tempBaseDir());
  const jobId = await store.createJob({ originalName: 'a.pdf', webp: true });
  const job = await store.getJob(jobId);

  assert.equal(job?.originalName, 'a.pdf');
  assert.equal(job?.webp, true);
  assert.equal(job?.status, 'processing');
  assert.ok(job?.uploadedAt);
});

test('getJob returns null for an unknown jobId', async () => {
  const store = createJobStore(tempBaseDir());

  assert.equal(await store.getJob('does-not-exist'), null);
});

test('updateJob merges a patch into existing metadata', async () => {
  const store = createJobStore(tempBaseDir());
  const jobId = await store.createJob({ originalName: 'a.pdf', webp: false });
  const updated = await store.updateJob(jobId, { status: 'done', transparentCount: 3 });

  assert.equal(updated.status, 'done');
  assert.equal(updated.transparentCount, 3);
  assert.equal(updated.originalName, 'a.pdf');

  const reread = await store.getJob(jobId);

  assert.equal(reread?.status, 'done');
  assert.equal(reread?.transparentCount, 3);
});

test('listJobs returns all jobs, newest first', async () => {
  const store = createJobStore(tempBaseDir());
  const first = await store.createJob({ originalName: 'first.pdf', webp: false });

  await store.updateJob(first, { uploadedAt: '2026-01-01T00:00:00.000Z' });
  const second = await store.createJob({ originalName: 'second.pdf', webp: false });

  await store.updateJob(second, { uploadedAt: '2026-06-01T00:00:00.000Z' });

  const jobs = await store.listJobs();

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].jobId, second);
  assert.equal(jobs[1].jobId, first);
});

test('listJobs returns an empty array when the base directory does not exist yet', async () => {
  const store = createJobStore(path.join(tempBaseDir(), 'does-not-exist-yet'));

  assert.deepEqual(await store.listJobs(), []);
});

test('deleteJob removes the job directory', async () => {
  const store = createJobStore(tempBaseDir());
  const jobId = await store.createJob({ originalName: 'a.pdf', webp: false });

  await store.deleteJob(jobId);
  assert.equal(await store.getJob(jobId), null);
});

test('jobDir returns the path a job lives at', async () => {
  const base = tempBaseDir();
  const store = createJobStore(base);
  const jobId = await store.createJob({ originalName: 'a.pdf', webp: false });

  assert.equal(store.jobDir(jobId), path.join(base, jobId));
});
