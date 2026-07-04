import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capItems } from '../lib/scraping/apifyRunner';

test('capItems truncates and filters null-ish', () => {
  const items = [{ a: 1 }, null, { a: 2 }, { a: 3 }];
  assert.deepEqual(capItems(items as never[], 2), [{ a: 1 }, { a: 2 }]);
});
