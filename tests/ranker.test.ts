import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatSizePrefs, rankerLeadRows } from '../lib/ai/ranker';
import type { EnrichedLead, SearchCriteria } from '../lib/types';

const size = (over: Partial<SearchCriteria['businessSize']>): SearchCriteria['businessSize'] => ({
  revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null, ...over,
});

test('formatSizePrefs surfaces an asking-price band', () => {
  const s = formatSizePrefs(size({ priceMax: 500_000 }));
  assert.match(s, /asking price/);
  assert.match(s, /500000/);
});

test('formatSizePrefs keeps revenue and price separate', () => {
  const s = formatSizePrefs(size({ revenueMax: 3_000_000, priceMax: 500_000 }));
  assert.match(s, /revenue/);
  assert.match(s, /asking price/);
});

test('formatSizePrefs is "no size preference" when nothing set', () => {
  assert.equal(formatSizePrefs(size({})), 'no size preference');
});

// Minimal lead builder — only the fields rankerLeadRows reads.
function lead(over: Partial<EnrichedLead>): EnrichedLead {
  return {
    businessName: 'Acme', address: null, city: 'Atlanta', state: 'GA', zip: null,
    phone: null, website: null, googleRating: null, reviewCount: null, categories: ['plumbing'],
    yearsInBusiness: null, employeeCount: null, bbbRating: null, bbbAccredited: null,
    source: 'businessesforsale', sourceUrl: null, rawData: null,
    id: 'x', contact: { ownerName: null, phone: null, email: null, linkedin: null, website: null },
    businessDetails: {
      yearsInBusiness: null, employeeCount: null, estimatedRevenue: '$1M-5M', googleRating: null,
      reviewCount: null, bbbRating: null, bbbAccredited: null, operatingHours: null, categories: ['plumbing'],
    },
    ...over,
  };
}

test('rankerLeadRows passes deal fields to the model', () => {
  const [row] = rankerLeadRows([lead({ forSale: true, askingPrice: 450_000, annualProfit: 120_000 })]);
  assert.equal(row.forSale, true);
  assert.equal(row.askingPrice, 450_000);
  assert.equal(row.cashFlow, 120_000);
});

test('rankerLeadRows prefers REAL revenue over the AI estimate', () => {
  const [row] = rankerLeadRows([lead({ annualRevenue: 300_000 })]);
  assert.equal(row.revenue, 300_000); // not the "$1M-5M" estimate
});

test('rankerLeadRows falls back to the estimate when no real revenue', () => {
  const [row] = rankerLeadRows([lead({ annualRevenue: null })]);
  assert.equal(row.revenue, '$1M-5M');
});

test('rankerLeadRows defaults forSale to false for non-listed businesses', () => {
  const [row] = rankerLeadRows([lead({ source: 'google_maps' })]);
  assert.equal(row.forSale, false);
  assert.equal(row.askingPrice, null);
});
