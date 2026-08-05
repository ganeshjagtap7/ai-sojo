import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../lib/safeNext';

const FB = '/app';

test('allows clean same-origin relative paths', () => {
  assert.equal(safeNext('/app', FB), '/app');
  assert.equal(safeNext('/app/search?x=1', FB), '/app/search?x=1');
});

test('rejects protocol-relative and absolute URLs', () => {
  assert.equal(safeNext('//evil.com', FB), FB);
  assert.equal(safeNext('https://evil.com', FB), FB);
  assert.equal(safeNext('http://evil.com', FB), FB);
});

test('rejects the backslash bypass (browsers normalize \\ to /)', () => {
  assert.equal(safeNext('/\\evil.com', FB), FB);   // "/\evil.com" -> "//evil.com"
  assert.equal(safeNext('\\\\evil.com', FB), FB);  // "\\evil.com" -> "//evil.com"
  assert.equal(safeNext('/\\/evil.com', FB), FB);  // "/\/evil.com" -> "///evil.com"
});

test('rejects empty / non-relative junk', () => {
  assert.equal(safeNext('', FB), FB);
  assert.equal(safeNext('evil.com', FB), FB);
});
