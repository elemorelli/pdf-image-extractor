import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from '../../test-helpers/testServer.ts';

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

test('POST /jobs/:jobId/download returns a zip of only the requested files', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();

  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
    const jobDir = jobStore.jobDir(jobId);

    await fsp.mkdir(path.join(jobDir, 'transparent'), { recursive: true });
    await fsp.mkdir(path.join(jobDir, 'opaque'), { recursive: true });
    await fsp.writeFile(path.join(jobDir, 'transparent', 'a.png'), 'fake-png-a');
    await fsp.writeFile(path.join(jobDir, 'transparent', 'b.png'), 'fake-png-b');
    await jobStore.updateJob(jobId, { status: 'done' });

    const res = await fetch(`${baseUrl}/jobs/${jobId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ subfolder: 'transparent', filename: 'a.png' }] }),
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') || '', /attachment/);
    const buf = Buffer.from(await res.arrayBuffer());

    assert.ok(buf.length > 0);
  } finally {
    server.close();
  }
});

test('POST /jobs/:jobId/download 400s when no valid files are given', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();

  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });

    await jobStore.updateJob(jobId, { status: 'done' });

    const res = await fetch(`${baseUrl}/jobs/${jobId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });

    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
