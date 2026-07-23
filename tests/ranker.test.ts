import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatSizePrefs, rankerLeadRows, mergeRankings } from '../lib/ai/ranker';
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

// mergeRankings — index-safe, fail-soft merge (no silent lead loss).
const rank = (index: number, matchScore: number, matchReason = 'r') => ({ index, matchScore, matchReason });
const NOW = '2026-01-01T00:00:00.000Z';

test('mergeRankings emits every lead once, even when the model omits an index', () => {
  const leads = [lead({ businessName: 'A' }), lead({ businessName: 'B' }), lead({ businessName: 'C' })]; // indices 0,1,2
  // model omits index 1 (the reported bug: "index 1 is missing")
  const out = mergeRankings(leads, [rank(0, 93), rank(2, 75)], { score: 0, reason: '' }, NOW);
  assert.equal(out.length, 3); // no lead dropped
  const byName = Object.fromEntries(out.map((l) => [l.businessName, l.matchScore]));
  assert.equal(byName.A, 93);
  assert.equal(byName.C, 75);
  assert.equal(byName.B, 0); // omitted → fallback, NOT deleted
});

test('mergeRankings ignores an out-of-range / hallucinated index without shifting the mapping', () => {
  const leads = [lead({ businessName: 'A' }), lead({ businessName: 'B' })]; // valid indices 0,1
  const out = mergeRankings(leads, [rank(9, 88), rank(0, 40)], { score: 0, reason: '' }, NOW);
  assert.equal(out.length, 2);
  const byName = Object.fromEntries(out.map((l) => [l.businessName, l.matchScore]));
  assert.equal(byName.A, 40); // index 0 scored
  assert.equal(byName.B, 0);  // index 9 ignored, B falls back
});

test('mergeRankings surfaces every lead un-ranked with the neutral fallback on total failure', () => {
  const leads = [lead({ businessName: 'A' }), lead({ businessName: 'B' })];
  const out = mergeRankings(leads, [], { score: 50, reason: 'unavailable' }, NOW);
  assert.equal(out.length, 2); // nothing lost on failure
  for (const l of out) {
    assert.equal(l.matchScore, 50);
    assert.equal(l.matchReason, 'unavailable');
  }
});

test('mergeRankings does not double-emit on duplicate indices; first wins', () => {
  const out = mergeRankings([lead({ businessName: 'A' }), lead({ businessName: 'B' })], [rank(0, 10), rank(0, 90)], { score: 0, reason: '' }, NOW);
  assert.equal(out.length, 2);
  assert.equal(out.find((l) => l.businessName === 'A')!.matchScore, 10); // first ranking for index 0 wins
});

test('mergeRankings sorts by matchScore descending', () => {
  const out = mergeRankings(
    [lead({ businessName: 'A' }), lead({ businessName: 'B' }), lead({ businessName: 'C' })],
    [rank(0, 30), rank(1, 90), rank(2, 60)], { score: 0, reason: '' }, NOW,
  );
  assert.deepEqual(out.map((l) => l.matchScore), [90, 60, 30]);
});
