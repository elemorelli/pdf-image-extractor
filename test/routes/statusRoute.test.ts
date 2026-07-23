import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../../test-helpers/testServer.ts';

test('GET /status/:jobId 404s for a malformed jobId', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/status/not-a-uuid`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
