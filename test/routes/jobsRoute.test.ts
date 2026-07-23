import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../../test-helpers/testServer.ts';

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
