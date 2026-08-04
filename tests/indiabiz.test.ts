import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseINR } from '../lib/scraping/indiabiz';

test('parseINR applies the trailing unit across a dash range (the reported bug)', () => {
  assert.equal(parseINR('10-50 Lakh'), 1_000_000); // was 10
  assert.equal(parseINR('2-5 Cr'), 20_000_000);
  assert.equal(parseINR('10 - 50 lakh'), 1_000_000); // spaced dash
});

test('parseINR still handles single values with a unit', () => {
  assert.equal(parseINR('INR 35.00 Cr'), 350_000_000);
  assert.equal(parseINR('INR 30.00 L'), 3_000_000);
  assert.equal(parseINR('500 K'), 500_000);
});

test('parseINR handles a bare number and non-strings', () => {
  assert.equal(parseINR('1500000'), 1_500_000);
  assert.equal(parseINR(null), null);
  assert.equal(parseINR('n/a'), null);
});
