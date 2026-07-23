import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from '../../test-helpers/testServer.ts';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('GET /jobs/:jobId returns image metadata for each extracted file', async () => {
  const { server, baseUrl, jobStore } = await startTestServer();

  try {
    const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
    const jobDir = jobStore.jobDir(jobId);

    await fsp.mkdir(path.join(jobDir, 'transparent'), { recursive: true });
    await fsp.writeFile(path.join(jobDir, 'transparent', 'a.png'), TINY_PNG);
    await jobStore.updateJob(jobId, { status: 'done', transparentCount: 1, opaqueCount: 0 });

    const res = await fetch(`${baseUrl}/jobs/${jobId}`);
    const detail = (await res.json()) as { transparent: unknown };

    assert.deepEqual(detail.transparent, [
      { filename: 'a.png', size: TINY_PNG.length, width: 1, height: 1 },
    ]);
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
