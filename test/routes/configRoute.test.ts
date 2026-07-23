import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../../test-helpers/testServer.ts';

test('GET /config returns the configured max upload size', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const res = await fetch(`${baseUrl}/config`);
    const body = (await res.json()) as { maxUploadBytes: number };

    assert.equal(res.status, 200);
    assert.equal(body.maxUploadBytes, 200 * 1024 * 1024);
  } finally {
    server.close();
  }
});
