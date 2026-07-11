import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapItems, buildInput } from '../lib/scraping/acquire';
import type { SearchCriteria } from '../lib/types';

// Real (trimmed) crawlerbros/acquire-scraper output — captured from a live run.
const items = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/marketplace/acquire.json'), 'utf-8'),
) as Record<string, unknown>[];

const leads = mapItems(items);

test('maps every fixture item', () => {
  assert.equal(leads.length, 3);
});

test('rich deal fields map (annual revenue/profit direct, both multiples, currency)', () => {
  const app = leads[0];
  assert.equal(app.askingPrice, 100000);
  assert.equal(app.annualRevenue, 351019); // already annual — no derivation
  assert.equal(app.annualProfit, 80642);
  assert.equal(app.revenueMultiple, 0.28);
  assert.equal(app.profitMultiple, 1.24);
  assert.equal(app.mrr, null); // Acquire reports annual, not monthly
  assert.equal(app.currency, 'USD');
  assert.equal(app.forSale, true);
  assert.equal(app.source, 'acquire');
  assert.deepEqual(app.categories, ['Mobile']);
  assert.ok(app.sourceUrl?.startsWith('https://app.acquire.com/'));
});

test('a listing with no public financials → nulls, keeps title/type', () => {
  const teaser = leads[2];
  assert.equal(teaser.askingPrice, null);
  assert.equal(teaser.annualRevenue, null);
  assert.equal(teaser.annualProfit, null);
  assert.equal(teaser.revenueMultiple, null);
  assert.deepEqual(teaser.categories, ['SaaS']);
  assert.ok(teaser.businessName.length > 0);
});

test('online startup has no physical location', () => {
  assert.equal(leads[0].city, null);
  assert.equal(leads[0].state, null);
});

test('full raw item preserved in rawData', () => {
  assert.ok(leads[0].rawData && typeof leads[0].rawData === 'object');
});

function crit(primary: string): SearchCriteria {
  return {
    location: { city: '', state: '', country: '', radiusMiles: 25 },
    industry: { primary, subSectors: [], keywords: [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null, priceMin: 10000, priceMax: 200000 },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'self_funded',
  };
}

test('buildInput maps price band + caps results', () => {
  const input = buildInput(crit('SaaS'));
  assert.equal(input.minPrice, 10000);
  assert.equal(input.maxPrice, 200000);
  assert.ok((input.maxItems as number) > 0);
});

test('buildInput maps the thesis to an Acquire category when it matches', () => {
  assert.deepEqual(buildInput(crit('SaaS')).categories, ['SaaS']);
  assert.deepEqual(buildInput(crit('ecommerce brand')).categories, ['Ecommerce']);
  assert.deepEqual(buildInput(crit('mobile app')).categories, ['Mobile']);
  // Unknown/ambiguous → omitted (broad search, ranker judges fit)
  assert.equal(buildInput(crit('newsletter')).categories, undefined);
});
