import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/app.js';

test('GET /health returns ok', async () => {
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  } finally {
    server.close();
  }
});
