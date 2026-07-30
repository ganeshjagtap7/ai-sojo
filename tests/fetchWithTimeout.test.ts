// tests/fetchWithTimeout.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchWithTimeout } from '../lib/scraping/fetchWithTimeout';

test('aborts a hung request at the deadline', async () => {
  // A local server that accepts the connection and never responds —
  // deterministic hang, no external network involved.
  const server = createServer(() => { /* never respond */ });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await assert.rejects(
      () => fetchWithTimeout(`http://127.0.0.1:${port}/never`, {}, 300),
      (err: unknown) => err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'),
    );
  } finally {
    server.close();
  }
});
