import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { createJobStore, type JobStore } from '../server/jobStore.ts';
import type { JobRunner, LiveProgress, StartParams } from '../server/jobRunner.ts';

const makeFakeAuditLog = () => ({
  log: async (): Promise<void> => {},
});

const makeFakeJobRunner = (jobStore: JobStore): JobRunner => ({
  start: async (jobId: string, _params: StartParams) => {
    const jobDir = jobStore.jobDir(jobId);
    await fsp.mkdir(path.join(jobDir, 'transparent'), { recursive: true });
    await fsp.mkdir(path.join(jobDir, 'opaque'), { recursive: true });
    await fsp.writeFile(path.join(jobDir, 'transparent', 'a.png'), 'fake-png');
    await jobStore.updateJob(jobId, { status: 'done', transparentCount: 1, opaqueCount: 0 });
  },
  getLiveProgress: (): LiveProgress | null => null,
  cancel: (): boolean => false,
});

const startTestServer = async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-test-'));
  const jobStore = createJobStore(baseDir);
  const jobRunner = makeFakeJobRunner(jobStore);
  const auditLog = makeFakeAuditLog();
  const app = createApp({ jobStore, jobRunner, auditLog });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, jobStore, baseUrl: `http://127.0.0.1:${port}` };
};

// The job runner (real or fake) processes a job asynchronously in the
// background, so tests must poll rather than assume it finished by the time
// the next request lands.
const waitForJobDone = async (
  baseUrl: string,
  jobId: string,
): Promise<{ status: string; transparent: string[]; opaque: string[] }> => {
  for (;;) {
    const res = await fetch(`${baseUrl}/jobs/${jobId}`);
    const detail = (await res.json()) as {
      status: string;
      transparent: string[];
      opaque: string[];
    };
    if (detail.status !== 'processing') return detail;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test('POST /extract creates a job and processes it via the injected runner', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const form = new FormData();
    form.append(
      'pdf',
      new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }),
      'sample.pdf',
    );
    form.append('webp', 'false');

    const res = await fetch(`${baseUrl}/extract`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    const { jobId } = (await res.json()) as { jobId: string };
    assert.ok(jobId);

    const detail = await waitForJobDone(baseUrl, jobId);
    assert.equal(detail.status, 'done');
    assert.deepEqual(detail.transparent, ['a.png']);
  } finally {
    server.close();
  }
});

test('POST /extract rejects a non-pdf upload', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const form = new FormData();
    form.append('pdf', new Blob([Buffer.from('not a pdf')], { type: 'text/plain' }), 'sample.txt');
    const res = await fetch(`${baseUrl}/extract`, { method: 'POST', body: form });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /jobs/:jobId/download returns a zip attachment', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();
  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
    const jobDir = jobStore.jobDir(jobId);
    await fsp.mkdir(path.join(jobDir, 'transparent'), { recursive: true });
    await fsp.mkdir(path.join(jobDir, 'opaque'), { recursive: true });
    await fsp.writeFile(path.join(jobDir, 'transparent', 'a.png'), 'fake-png');
    await jobStore.updateJob(jobId, { status: 'done' });

    const res = await fetch(`${baseUrl}/jobs/${jobId}/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') || '', /attachment/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0);
  } finally {
    server.close();
  }
});

test('DELETE /jobs/:jobId removes the job', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();
  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
    await jobStore.updateJob(jobId, { status: 'done' });

    const delRes = await fetch(`${baseUrl}/jobs/${jobId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 204);

    const getRes = await fetch(`${baseUrl}/jobs/${jobId}`);
    assert.equal(getRes.status, 404);
  } finally {
    server.close();
  }
});

test('DELETE .../files/:subfolder/:filename 409s while the job is still processing', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();
  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
    await fsp.mkdir(path.join(jobStore.jobDir(jobId), 'transparent'), { recursive: true });
    await fsp.writeFile(path.join(jobStore.jobDir(jobId), 'transparent', 'a.png'), 'fake-png');

    const res = await fetch(`${baseUrl}/jobs/${jobId}/files/transparent/a.png`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 409);
  } finally {
    server.close();
  }
});

test('DELETE .../files/:subfolder/:filename removes the file and decrements the count once done', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();
  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
    const jobDir = jobStore.jobDir(jobId);
    await fsp.mkdir(path.join(jobDir, 'transparent'), { recursive: true });
    await fsp.writeFile(path.join(jobDir, 'transparent', 'a.png'), 'fake-png');
    await jobStore.updateJob(jobId, { status: 'done', transparentCount: 1, opaqueCount: 0 });

    const res = await fetch(`${baseUrl}/jobs/${jobId}/files/transparent/a.png`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 204);
    assert.ok(!fs.existsSync(path.join(jobDir, 'transparent', 'a.png')));

    const job = await jobStore.getJob(jobId);
    assert.equal(job?.transparentCount, 0);
  } finally {
    server.close();
  }
});

test('GET /status/:jobId 404s for a malformed jobId', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/status/not-a-uuid`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
