import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapItems, buildInput } from '../lib/scraping/empireflippers';
import type { SearchCriteria } from '../lib/types';

// Real (trimmed) memo23/empireflippers-scraper output — captured from a live run.
const items = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/marketplace/empireflippers.json'), 'utf-8'),
) as Record<string, unknown>[];

const leads = mapItems(items);

test('maps every fixture item', () => {
  assert.equal(leads.length, 3);
});

test('shows monthly MRR as listed; no derived annual, no multiple', () => {
  const a = leads[0];
  assert.equal(a.askingPrice, 2542357);
  assert.equal(a.mrr, 106900); // monthlyGrossRevenue, as listed
  assert.equal(a.annualRevenue, null); // not derived
  assert.equal(a.annualProfit, null);
  assert.equal(a.revenueMultiple, null); // EF's monthly multiple is omitted…
  assert.equal(a.profitMultiple, null);
  assert.equal(a.currency, 'USD');
  assert.equal(a.forSale, true);
  assert.equal(a.source, 'empireflippers');
});

test('…but the raw multiple/net-profit stay in rawData', () => {
  const raw = leads[0].rawData as Record<string, unknown>;
  assert.equal(raw.multiple, 24);
  assert.equal(raw.monthlyNetProfit, 105932);
});

test('categories come from niches', () => {
  assert.deepEqual(leads[0].categories, ['Technology']);
  assert.deepEqual(leads[1].categories, ['Apparel & Accessories', 'Home']);
});

test('sourceUrl is the real Empire Flippers listing link', () => {
  assert.ok(leads[0].sourceUrl?.startsWith('https://empireflippers.com/listing/'));
});

test('online business — no physical location', () => {
  assert.equal(leads[0].city, null);
  assert.equal(leads[0].state, null);
});

test('buildInput passes keyword + active statuses + cap', () => {
  const criteria: SearchCriteria = {
    location: { city: '', state: '', country: '', radiusMiles: 25 },
    industry: { primary: 'SaaS', subSectors: [], keywords: [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'self_funded',
  };
  const input = buildInput(criteria);
  assert.equal(input.q, 'SaaS');
  assert.deepEqual(input.listingStatuses, ['For Sale', 'New Listing']);
  assert.ok((input.maxItems as number) > 0);
});
