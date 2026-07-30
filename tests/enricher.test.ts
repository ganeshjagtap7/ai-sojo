import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mergeBatch, enrichLeads } from '../lib/ai/enricher';
import type { RawLead } from '../lib/types';

function lead(name: string, over: Partial<RawLead> = {}): RawLead {
  return {
    businessName: name, address: null, city: null, state: null, zip: null,
    phone: '555', website: 'w.com', googleRating: null, reviewCount: null, categories: ['x'],
    yearsInBusiness: null, employeeCount: 3, bbbRating: null, bbbAccredited: null,
    source: 'google_maps', sourceUrl: null, rawData: null, ...over,
  };
}
const enr = (index: number, over = {}) => ({
  index, estimatedRevenue: '$1M', linkedinSearchUrl: 'https://linkedin.com/search', ...over,
});

test('out-of-range model index does NOT throw and every lead is still returned', () => {
  const batch = [lead('A'), lead('B')]; // valid indices 0,1
  // model hallucinates index 5 (the original crash) + a valid one for index 0
  const out = mergeBatch(batch, [enr(5), enr(0)]);
  assert.equal(out.length, 2); // both leads emitted, no crash
  assert.equal(out[0].businessDetails.estimatedRevenue, '$1M'); // index 0 enriched
  assert.equal(out[1].businessDetails.estimatedRevenue, null);  // index 1 had no valid enrichment
});

test('a batch with NO enrichments (failed batch) still emits every lead, un-enriched', () => {
  const out = mergeBatch([lead('A'), lead('B'), lead('C')], []);
  assert.equal(out.length, 3);
  for (const l of out) {
    assert.equal(l.businessDetails.estimatedRevenue, null);
    assert.equal(l.contact.linkedin, null);
  }
});

test('real scraped fields are preserved; AI guesses are never surfaced as scraped', () => {
  const [l] = mergeBatch([lead('A', { employeeCount: 9, askingPrice: 500000, currency: 'USD' })], [enr(0)]);
  assert.equal(l.businessName, 'A');
  assert.equal(l.askingPrice, 500000);        // deal field preserved
  assert.equal(l.currency, 'USD');
  assert.equal(l.businessDetails.employeeCount, 9); // real count, not the AI estimate
  assert.equal(l.contact.email, null);         // emailGuess never surfaced
  assert.equal(l.contact.ownerName, null);
  assert.equal(l.contact.linkedin, 'https://linkedin.com/search'); // the one AI field we keep
});

test('duplicate indices from the model do not double-emit a lead', () => {
  const out = mergeBatch([lead('A'), lead('B')], [enr(0, { estimatedRevenue: '$2M' }), enr(0, { estimatedRevenue: '$9M' })]);
  assert.equal(out.length, 2); // exactly one row per batch lead
  assert.equal(out[0].businessDetails.estimatedRevenue, '$2M'); // first enrichment for index 0 wins
});

test('a passed deadline short-circuits enrichment to un-enriched leads (no model call)', async () => {
  const raw = {
    businessName: 'Acme Plumbing', address: null, city: 'Atlanta', state: 'GA', zip: null,
    phone: '404-555-0100', website: null, googleRating: null, reviewCount: null, categories: [],
    yearsInBusiness: null, employeeCount: null, bbbRating: null, bbbAccredited: null,
    source: 'google_maps' as const, sourceUrl: null, rawData: {},
  };
  const criteria = {
    location: { city: 'Atlanta', state: 'GA', country: 'United States', radiusMiles: 25 },
    industry: { primary: 'Plumbing', subSectors: [], keywords: [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'unknown' as const,
  };
  // Deadline in the past → must return without ever touching the model/network.
  const out = await enrichLeads([raw], criteria, Date.now() - 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].businessName, 'Acme Plumbing');
  assert.equal(out[0].businessDetails.estimatedRevenue, null);
});
