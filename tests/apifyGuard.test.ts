// tests/apifyGuard.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRunUsable } from '../lib/scraping/apifyGuard';

test('terminal failure statuses throw', () => {
  for (const status of ['FAILED', 'ABORTED', 'TIMED-OUT']) {
    assert.throws(() => assertRunUsable({ id: 'run1', status }, 'Test'), new RegExp(status));
  }
});

test('SUCCEEDED and still-RUNNING runs pass (partial data is usable)', () => {
  assert.doesNotThrow(() => assertRunUsable({ id: 'run1', status: 'SUCCEEDED' }, 'Test'));
  assert.doesNotThrow(() => assertRunUsable({ id: 'run1', status: 'RUNNING' }, 'Test'));
});
