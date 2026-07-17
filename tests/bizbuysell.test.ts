import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapItems } from '../lib/scraping/bizbuysell';
import type { SearchCriteria } from '../lib/types';

// Real (trimmed) shahidirfan/bizbuysell-scraper output — captured from a live run.
const items = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/marketplace/bizbuysell.json'), 'utf-8'),
) as Record<string, unknown>[];

const criteria: SearchCriteria = {
  location: { city: 'Dallas', state: 'TX', country: 'United States', radiusMiles: 50 },
  industry: { primary: 'plumbing', subSectors: [], keywords: [] },
  businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
  preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
  searcherType: 'self_funded',
};

const leads = mapItems(items, criteria);

test('maps every fixture item', () => {
  assert.equal(leads.length, 3);
});

test('deal fields map as real numbers, tagged for sale in USD', () => {
  const a = leads[0];
  assert.equal(a.askingPrice, 1900000);
  assert.equal(a.annualRevenue, 165000);
  assert.equal(a.annualProfit, 145000);
  assert.equal(a.currency, 'USD');
  assert.equal(a.forSale, true);
  assert.equal(a.source, 'bizbuysell');
});

test('city parsed from "City, ST"; state from state_code', () => {
  assert.equal(leads[0].city, 'Folsom');
  assert.equal(leads[0].state, 'CA');
});

test('broker phone maps to lead.phone', () => {
  assert.equal(leads[0].phone, '(510) 590-1224');
});

test('sourceUrl is the real listing link', () => {
  assert.ok(leads[0].sourceUrl?.startsWith('https://www.bizbuysell.com/'));
});

test('missing cash_flow → annualProfit null (never fabricated)', () => {
  const redding = leads[1];
  assert.equal(redding.annualProfit, null);
  assert.equal(redding.askingPrice, 3160000);
  assert.equal(redding.annualRevenue, 1200000);
});

test('asset sale with no revenue/cash flow → both null, price kept', () => {
  const m = leads[2];
  assert.equal(m.annualRevenue, null);
  assert.equal(m.annualProfit, null);
  assert.equal(m.askingPrice, 125000);
});

test('category comes from listing_category', () => {
  assert.deepEqual(leads[0].categories, ['business']);
});

test('foundedDate from year_established', () => {
  assert.equal(leads[0].foundedDate, '1996');
});

test('full raw item preserved in rawData', () => {
  assert.ok(leads[0].rawData && typeof leads[0].rawData === 'object');
});
