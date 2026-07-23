import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../../test-helpers/testServer.ts';

test('GET /status/:jobId 404s for a malformed jobId', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const res = await fetch(`${baseUrl}/api/status/not-a-uuid`);

    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /status/:jobId/stream 404s for a malformed jobId', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const res = await fetch(`${baseUrl}/api/status/not-a-uuid/stream`);

    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /status/:jobId/stream 404s for a jobId that does not exist', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const res = await fetch(`${baseUrl}/api/status/00000000-0000-4000-8000-000000000000/stream`);

    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /status/:jobId/stream sends an SSE event announcing job completion', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const form = new FormData();

    form.append(
      'pdf',
      new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }),
      'sample.pdf',
    );

    const extractRes = await fetch(`${baseUrl}/api/extract`, { method: 'POST', body: form });
    const { jobId } = (await extractRes.json()) as { jobId: string };

    const streamRes = await fetch(`${baseUrl}/api/status/${jobId}/stream`);

    assert.equal(streamRes.status, 200);
    assert.ok(streamRes.headers.get('content-type')?.startsWith('text/event-stream'));

    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!buffer.includes('"done":true')) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
    }

    await reader.cancel();

    const lastEvent = buffer.trim().split('\n\n').filter(Boolean).pop() ?? '';
    const payload = JSON.parse(lastEvent.replace(/^data: /, ''));

    assert.equal(payload.done, true);
    assert.equal(payload.error, null);
  } finally {
    server.close();
  }
});
