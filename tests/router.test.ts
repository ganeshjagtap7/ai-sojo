import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSources, isDigitalIndustry } from '../lib/scraping/router';
import { SearchCriteria } from '../lib/types';

function crit(over: Partial<{ city: string; state: string; country: string; primary: string; keywords: string[] }>): SearchCriteria {
  return {
    location: { city: over.city ?? '', state: over.state ?? '', country: over.country ?? 'US', radiusMiles: 25 },
    industry: { primary: over.primary ?? '', subSectors: [], keywords: over.keywords ?? [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'self_funded',
  };
}

test('plumbing in Atlanta: US local + US deal listings, no digital/India sources', () => {
  const ids = selectSources(crit({ city: 'Atlanta', state: 'GA', primary: 'plumbing' })).map((s) => s.id);
  assert.ok(ids.includes('google_maps') && ids.includes('bbb'), 'core always runs');
  assert.ok(ids.includes('yellowpages'), 'US local directory');
  assert.ok(ids.includes('businessesforsale'), 'US deal listings');
  assert.ok(ids.includes('serviceexperts'), 'plumbing matches niche directory tags');
  assert.ok(!ids.includes('trustmrr') && !ids.includes('sideprojectors'), 'no micro-SaaS for plumbing');
  assert.ok(!ids.includes('smedealz') && !ids.includes('buybiz'), 'no India sources for US search');
});

test('SaaS with no location: digital sources, no US local directories', () => {
  const ids = selectSources(crit({ country: '', primary: 'SaaS', keywords: ['b2b software'] })).map((s) => s.id);
  assert.ok(ids.includes('trustmrr') && ids.includes('sideprojectors'), 'micro-SaaS sources');
  assert.ok(!ids.includes('yellowpages') && !ids.includes('manta'), 'local directories are for local businesses');
});

test('retail in India: India deal sources', () => {
  const ids = selectSources(crit({ country: 'India', city: 'Pune', primary: 'retail' })).map((s) => s.id);
  assert.ok(ids.includes('smedealz') && ids.includes('buybiz'), 'India listing sites');
  assert.ok(!ids.includes('yellowpages') && !ids.includes('businessesforsale'), 'US-only sources excluded');
});

test('respects MAX_EXTRA_SOURCES cap', () => {
  process.env.MAX_EXTRA_SOURCES = '2';
  const picked = selectSources(crit({ city: 'Atlanta', state: 'GA', primary: 'plumbing' }));
  const extras = picked.filter((s) => !s.alwaysRun);
  assert.ok(extras.length <= 2, `expected <=2 extras, got ${extras.map((s) => s.id).join(',')}`);
  delete process.env.MAX_EXTRA_SOURCES;
});

test('isDigitalIndustry', () => {
  assert.equal(isDigitalIndustry(crit({ primary: 'SaaS' }).industry), true);
  assert.equal(isDigitalIndustry(crit({ primary: 'plumbing' }).industry), false);
});
