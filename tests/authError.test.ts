import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyAuthError } from '../lib/errors/authError';

test('network transport errors become a calm connection message (never raw "fetch failed")', () => {
  for (const raw of ['fetch failed', 'TypeError: NetworkError when attempting to fetch', 'request timed out', 'ECONNREFUSED']) {
    const out = friendlyAuthError(raw, 'login');
    assert.match(out, /couldn't reach the server/i);
    assert.doesNotMatch(out, /fetch failed|econn/i);
  }
});

test('login: invalid credentials → combined message that nudges signup', () => {
  const out = friendlyAuthError('Invalid login credentials', 'login');
  assert.match(out, /incorrect/i);
  assert.match(out, /create an account/i);
});

test('signup: already-registered → suggests signing in', () => {
  const out = friendlyAuthError('User already registered', 'signup');
  assert.match(out, /already registered/i);
  assert.match(out, /signing in/i);
});

test('signup: weak password → 6-character guidance', () => {
  const out = friendlyAuthError('Password should be at least 6 characters', 'signup');
  assert.match(out, /at least 6 characters/i);
});

test('rate limiting → wait-and-retry message (both contexts)', () => {
  assert.match(friendlyAuthError('email rate limit exceeded', 'login'), /too many attempts/i);
  assert.match(friendlyAuthError('too many requests', 'signup'), /too many attempts/i);
});

test('unknown errors fall back to calm generic copy, never the raw string', () => {
  const login = friendlyAuthError('some_internal_sdk_code_xyz', 'login');
  const signup = friendlyAuthError('some_internal_sdk_code_xyz', 'signup');
  assert.doesNotMatch(login, /xyz/);
  assert.doesNotMatch(signup, /xyz/);
  assert.match(login, /sign you in/i);
  assert.match(signup, /create your account/i);
});
