import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from '../../test-helpers/testServer.ts';

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
