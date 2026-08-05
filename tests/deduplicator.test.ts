import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { deduplicateLeads } from '../lib/utils/deduplicator';
import { RawLead } from '../lib/types';

function lead(partial: Partial<RawLead>): RawLead {
  return {
    businessName: 'Default Business',
    address: null,
    city: 'Atlanta',
    state: null,
    zip: null,
    phone: null,
    website: null,
    googleRating: null,
    reviewCount: null,
    categories: [],
    yearsInBusiness: null,
    employeeCount: null,
    bbbRating: null,
    bbbAccredited: null,
    source: 'web_search',
    sourceUrl: null,
    rawData: null,
    ...partial,
  };
}

test('same normalized name + same city merge into one row', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'Atlanta Premier Plumbing, LLC', city: 'Atlanta' }),
    lead({ businessName: 'Atlanta Premier Plumbing', city: 'atlanta' }),
  ]);
  assert.equal(out.length, 1);
});

test('existing scalar wins on conflict; incoming fills only nulls', () => {
  const out = deduplicateLeads([
    lead({
      businessName: 'Acme Co',
      city: 'Atlanta',
      phone: '404-555-0001',
      website: null,
    }),
    lead({
      businessName: 'Acme',
      city: 'Atlanta',
      phone: '404-555-9999',
      website: 'https://acme.com',
    }),
  ]);
  assert.equal(out.length, 1);
  // existing non-null phone is kept
  assert.equal(out[0].phone, '404-555-0001');
  // existing null website is filled by incoming
  assert.equal(out[0].website, 'https://acme.com');
});

test('categories: existing empty array is replaced by incoming non-empty', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'Bright Cleaners', city: 'Atlanta', categories: [] }),
    lead({ businessName: 'Bright Cleaners', city: 'Atlanta', categories: ['cleaning'] }),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].categories, ['cleaning']);
});

test('existing non-empty categories are kept over incoming', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'Bright Cleaners', city: 'Atlanta', categories: ['janitorial'] }),
    lead({ businessName: 'Bright Cleaners', city: 'Atlanta', categories: ['cleaning'] }),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].categories, ['janitorial']);
});

test('two distinct businesses stay as two separate rows', () => {
  const out = deduplicateLeads([
    lead({
      businessName: 'Atlanta Premier Plumbing',
      city: 'Atlanta',
      phone: '404-555-0001',
      website: 'https://atlantaplumbing.com',
    }),
    lead({
      businessName: 'Chicago HVAC Experts',
      city: 'Chicago',
      phone: '312-555-2222',
      website: 'https://chicagohvac.com',
    }),
  ]);
  assert.equal(out.length, 2);
});

// ── §6 cross-source dedupe ──────────────────────────────────────────────

test('same listing scraped twice (tracking params/protocol) dedupes via normalized URL', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'Coastal Gem', city: null, sourceUrl: 'https://www.bizbuysell.com/business-opportunity/foo/123/?utm=a' }),
    lead({ businessName: 'Different headline, same listing', city: null, sourceUrl: 'https://bizbuysell.com/business-opportunity/foo/123?ref=b' }),
  ]);
  assert.equal(out.length, 1);
});

test('same online business on two marketplaces merges into one row, deal fields preserved', () => {
  const out = deduplicateLeads([
    lead({
      businessName: 'CloudInvoice SaaS', city: null, source: 'flippa',
      sourceUrl: 'https://flippa.com/111', mrr: 5000, forSale: true, currency: 'USD',
    }),
    lead({
      businessName: 'CloudInvoice SaaS', city: null, source: 'acquire',
      sourceUrl: 'https://app.acquire.com/startup/222', askingPrice: 150000, annualRevenue: 60000, currency: 'USD',
    }),
  ]);
  assert.equal(out.length, 1);
  const m = out[0];
  assert.equal(m.mrr, 5000); // kept from the first (Flippa) record
  assert.equal(m.askingPrice, 150000); // filled from Acquire — would have been dropped before §6
  assert.equal(m.annualRevenue, 60000);
  assert.equal(m.forSale, true);
});

test('two different online businesses (no city) stay separate', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'CloudInvoice SaaS', city: null, sourceUrl: 'https://flippa.com/111' }),
    lead({ businessName: 'MailPilot App', city: null, sourceUrl: 'https://flippa.com/222' }),
  ]);
  assert.equal(out.length, 2);
});

test('broker-phone sources do NOT merge two businesses that share a broker number', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'Elegant Nails Salon', city: 'Miami', source: 'bizbuysell', phone: '305-555-7777', sourceUrl: 'https://bizbuysell.com/a/1' }),
    lead({ businessName: "Joe's Diner", city: 'Tampa', source: 'bizbuysell', phone: '305-555-7777', sourceUrl: 'https://bizbuysell.com/a/2' }),
  ]);
  assert.equal(out.length, 2); // same broker phone must not collapse unrelated businesses
});

test('local-directory sources still merge on the business phone', () => {
  const out = deduplicateLeads([
    lead({ businessName: 'ABC Cleaning', city: 'Atlanta', source: 'google_maps', phone: '404-555-1234' }),
    lead({ businessName: 'XYZ Cleaning', city: 'Atlanta', source: 'yellowpages', phone: '404-555-1234' }),
  ]);
  assert.equal(out.length, 1); // same real business line → still one business
});
