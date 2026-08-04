import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currencyForSource } from '../lib/money';

test('every India-region source resolves to INR (not the USD fallback)', () => {
  for (const s of ['businessex', 'buybiz', 'smedealz', 'indiabiz', 'mergerdomo', 'tobuz', 'businessdeals']) {
    assert.equal(currencyForSource(s), 'INR', `${s} should be INR`);
  }
});

test('non-India sources fall back to USD', () => {
  assert.equal(currencyForSource('bizbuysell'), 'USD');
  assert.equal(currencyForSource('unknown_source'), 'USD');
});
