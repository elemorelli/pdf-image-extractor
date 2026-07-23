import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, waitForJobDone } from '../../test-helpers/testServer.ts';

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
