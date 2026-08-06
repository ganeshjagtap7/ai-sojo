import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyActionError } from '../lib/errors/actionError';

const FALLBACK = "We couldn't save your thesis right now. Please try again.";

test('network failure (TypeError from fetch) → connection message, not the raw text', () => {
  const out = friendlyActionError(new TypeError('Failed to fetch'), FALLBACK);
  assert.match(out, /couldn't reach the server/i);
  assert.doesNotMatch(out, /failed to fetch/i);
});

test('a deliberately-thrown friendly Error passes through as-is', () => {
  const msg = 'Your thesis answers did not come through — please redo the conversation.';
  assert.equal(friendlyActionError(new Error(msg), FALLBACK), msg);
});

test('a non-Error / empty value → the caller fallback', () => {
  assert.equal(friendlyActionError(undefined, FALLBACK), FALLBACK);
  assert.equal(friendlyActionError({}, FALLBACK), FALLBACK);
  assert.equal(friendlyActionError(new Error(''), FALLBACK), FALLBACK);
});
