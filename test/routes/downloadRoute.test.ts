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
