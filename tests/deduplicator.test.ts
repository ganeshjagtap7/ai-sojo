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
