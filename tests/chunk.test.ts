// tests/chunk.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkArray } from '../lib/utils/chunk';

test('splits into even chunks with a remainder tail', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('empty input produces no chunks', () => {
  assert.deepEqual(chunkArray([], 3), []);
});

test('chunk size larger than the array yields one chunk', () => {
  assert.deepEqual(chunkArray([1, 2], 10), [[1, 2]]);
});
