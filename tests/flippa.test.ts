import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapItems, buildInput } from '../lib/scraping/flippa';
import type { SearchCriteria } from '../lib/types';

// Real (trimmed) parseforge/flippa-scraper output — captured from a live run.
const items = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/marketplace/flippa.json'), 'utf-8'),
) as Record<string, unknown>[];

const leads = mapItems(items);

test('maps every fixture item', () => {
  assert.equal(leads.length, 3);
});

test('shows monthly MRR as listed; no derived annual figures', () => {
  const saas = leads[0];
  assert.equal(saas.mrr, 7411); // monthly, exactly as Flippa lists
  assert.equal(saas.annualRevenue, null); // not derived — Flippa lists monthly only
  assert.equal(saas.annualProfit, null);
  assert.equal(saas.askingPrice, 170000);
  assert.equal(saas.revenueMultiple, 1.9);
  assert.equal(saas.profitMultiple, 2.8);
  assert.equal(saas.currency, 'USD');
  assert.equal(saas.forSale, true);
  assert.equal(saas.source, 'flippa');
});

test('categories are [propertyType, category]', () => {
  assert.deepEqual(leads[0].categories, ['SaaS', 'Internet']);
  assert.deepEqual(leads[2].categories, ['Ecommerce', 'Sports and Outdoor']);
});

test('pre-revenue listing: 0 becomes null (no misleading $0 / 0×), price kept', () => {
  const preRev = leads[1];
  assert.equal(preRev.askingPrice, 87500);
  assert.equal(preRev.mrr, null);
  assert.equal(preRev.annualRevenue, null);
  assert.equal(preRev.annualProfit, null);
  assert.equal(preRev.revenueMultiple, null);
  assert.equal(preRev.profitMultiple, null);
});

test('ecommerce deal: monthly MRR + multiples, no derived annual', () => {
  const ec = leads[2];
  assert.equal(ec.askingPrice, 1627399);
  assert.equal(ec.mrr, 514419); // monthly, as listed
  assert.equal(ec.annualRevenue, null);
  assert.equal(ec.annualProfit, null);
  assert.equal(ec.revenueMultiple, 0.3);
  assert.equal(ec.profitMultiple, 1.3);
});

test('captures US state for location ranking; non-US and city stay null', () => {
  assert.equal(leads[0].city, null); // Flippa never gives a city
  assert.equal(leads[0].state, null); // item 0 is "India" → no US state
  assert.equal(leads[1].state, 'CA'); // "CA, United States" → California
  assert.equal(leads[2].state, 'DE'); // "DE, United States" → Delaware
});

test('sourceUrl is the real Flippa listing link', () => {
  assert.ok(leads[0].sourceUrl?.startsWith('https://flippa.com/'));
});

test('full raw item preserved in rawData', () => {
  assert.ok(leads[0].rawData && typeof leads[0].rawData === 'object');
});

test('buildInput passes keyword + price band (not the annual revenue band)', () => {
  const criteria: SearchCriteria = {
    location: { city: '', state: '', country: '', radiusMiles: 25 },
    industry: { primary: 'SaaS', subSectors: [], keywords: [] },
    businessSize: { revenueMin: 200000, revenueMax: null, employeeMin: null, employeeMax: null, priceMax: 50000 },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'self_funded',
  };
  const input = buildInput(criteria);
  assert.equal(input.searchQuery, 'SaaS');
  assert.equal(input.priceMax, 50000);
  assert.equal(input.revenueMin, undefined); // annual band NOT passed to Flippa's monthly filter
});
