import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toFriendlyError, NO_RESULTS } from '../lib/errors/friendly';

const NO_RESULTS_MSG = 'No matches yet — try broadening your location or industry.';
const QUOTA_MSG = "You're going a bit fast — please wait a moment and try again.";
const SCRAPER_MSG = 'We hit a snag pulling business listings. Please try again in a moment.';
const AI_MSG = 'Our AI is briefly unavailable. Please try again shortly.';
const FALLBACK_MSG = 'Something went wrong on our end. Please try again.';

// === Apify / scraper ===

test('ApifyApiError maps to scraper copy', () => {
  const err = new Error('Actor run failed on dataset push');
  err.name = 'ApifyApiError';
  const r = toFriendlyError(err);
  assert.equal(r.userMessage, SCRAPER_MSG);
});

test('plain "Apify" message maps to scraper copy', () => {
  const r = toFriendlyError(new Error('Apify run did not finish'));
  assert.equal(r.userMessage, SCRAPER_MSG);
});

test('scraper failure string maps to scraper copy', () => {
  const r = toFriendlyError('Google Maps scraper crashed');
  assert.equal(r.userMessage, SCRAPER_MSG);
});

// === AI / model ===

test('Anthropic error maps to AI copy', () => {
  const r = toFriendlyError(new Error('Anthropic API: model overloaded'));
  assert.equal(r.userMessage, AI_MSG);
});

test('completion error maps to AI copy', () => {
  const r = toFriendlyError(new Error('Failed to generate completion'));
  assert.equal(r.userMessage, AI_MSG);
});

// === Quota / rate limit ===

test('HTTP 429 status maps to quota copy', () => {
  const err = Object.assign(new Error('Request failed'), { status: 429 });
  const r = toFriendlyError(err);
  assert.equal(r.userMessage, QUOTA_MSG);
});

test('"rate limit" message maps to quota copy', () => {
  const r = toFriendlyError(new Error('Rate limit exceeded'));
  assert.equal(r.userMessage, QUOTA_MSG);
});

test('"too many requests" maps to quota copy', () => {
  const r = toFriendlyError({ message: 'Too Many Requests' });
  assert.equal(r.userMessage, QUOTA_MSG);
});

test('quota wins over AI when an LLM rate-limits', () => {
  // An overloaded/rate-limited model error should read as "slow down", not
  // "AI unavailable" — quota is checked first.
  const r = toFriendlyError(new Error('Anthropic rate limit (429) exceeded'));
  assert.equal(r.userMessage, QUOTA_MSG);
});

// === NO_RESULTS ===

test('NO_RESULTS sentinel string maps to no-results copy', () => {
  const r = toFriendlyError(NO_RESULTS);
  assert.equal(r.userMessage, NO_RESULTS_MSG);
});

test('NO_RESULTS as a code field maps to no-results copy', () => {
  const r = toFriendlyError({ code: 'NO_RESULTS', message: 'empty' });
  assert.equal(r.userMessage, NO_RESULTS_MSG);
});

test('pipeline "No results found" Error maps to no-results copy', () => {
  const r = toFriendlyError(
    new Error('No results found from any source. Try broadening your criteria.')
  );
  assert.equal(r.userMessage, NO_RESULTS_MSG);
});

// === Fallback ===

test('unknown error maps to fallback copy', () => {
  const r = toFriendlyError(new Error('Some weird internal explosion'));
  assert.equal(r.userMessage, FALLBACK_MSG);
});

test('null maps to fallback copy without throwing', () => {
  const r = toFriendlyError(null);
  assert.equal(r.userMessage, FALLBACK_MSG);
});

test('undefined maps to fallback copy without throwing', () => {
  const r = toFriendlyError(undefined);
  assert.equal(r.userMessage, FALLBACK_MSG);
});

test('number maps to fallback copy', () => {
  const r = toFriendlyError(42);
  assert.equal(r.userMessage, FALLBACK_MSG);
});

// === logDetail capture ===

test('logDetail captures message and name', () => {
  const err = new Error('boom');
  err.name = 'WeirdError';
  const r = toFriendlyError(err);
  assert.ok(r.logDetail.includes('boom'));
  assert.ok(r.logDetail.includes('WeirdError'));
});

test('logDetail captures status code', () => {
  const err = Object.assign(new Error('nope'), { status: 429 });
  const r = toFriendlyError(err);
  assert.ok(r.logDetail.includes('429'));
});

test('logDetail is never empty', () => {
  assert.ok(toFriendlyError(null).logDetail.length > 0);
  assert.ok(toFriendlyError(new Error('')).logDetail.length > 0);
});

// === user message is always clean ===

test('userMessage never leaks raw technical detail', () => {
  const err = new Error('ApifyApiError: actor run abc123 failed at dataset XYZ');
  const r = toFriendlyError(err);
  assert.equal(r.userMessage, SCRAPER_MSG);
  assert.ok(!r.userMessage.includes('abc123'));
  assert.ok(!/error/i.test(r.userMessage));
});
