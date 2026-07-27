import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, countryCodeOf, isUSCountry, mergeLocation } from '../lib/geo';

const SE = { city: 'Atlanta', state: 'GA' };

test('US region quick-pick resolves to its metro, country US', () => {
  const loc = parseLocation(['Southeast'], SE);
  assert.equal(loc.city, 'Atlanta');
  assert.equal(loc.state, 'GA');
  assert.equal(loc.country, 'United States');
});

test('"Mumbai, India" → India with city', () => {
  const loc = parseLocation(['Mumbai', 'India']);
  assert.equal(loc.city, 'Mumbai');
  assert.equal(loc.country, 'India');
});

test('country-only "India" → India, no city', () => {
  const loc = parseLocation(['India']);
  assert.equal(loc.country, 'India');
  assert.equal(loc.city, '');
});

test('"Austin, TX" stays a US search, not a country', () => {
  const loc = parseLocation(['Austin', 'TX']);
  assert.equal(loc.city, 'Austin');
  assert.equal(loc.state, 'TX');
  assert.equal(loc.country, 'United States');
});

test('"Toronto, Canada" → Canada', () => {
  const loc = parseLocation(['Toronto', 'Canada']);
  assert.equal(loc.country, 'Canada');
  assert.equal(loc.city, 'Toronto');
});

test('aliases canonicalize (uk → United Kingdom)', () => {
  const loc = parseLocation(['London', 'UK']);
  assert.equal(loc.country, 'United Kingdom');
});

test('unknown foreign country still routes as that country', () => {
  const loc = parseLocation(['Lisbon', 'Portugal']);
  assert.equal(loc.country, 'Portugal');
  assert.equal(loc.city, 'Lisbon');
});

test('bare city with no signal defaults to US', () => {
  const loc = parseLocation(['Springfield']);
  assert.equal(loc.country, 'United States');
  assert.equal(loc.city, 'Springfield');
});

test('empty input falls back to the provided US region', () => {
  const loc = parseLocation([], SE);
  assert.equal(loc.city, 'Atlanta');
  assert.equal(loc.country, 'United States');
});

test('countryCodeOf maps known names, empty otherwise', () => {
  assert.equal(countryCodeOf('India'), 'in');
  assert.equal(countryCodeOf('United States'), 'us');
  assert.equal(countryCodeOf('Portugal'), '');
  assert.equal(countryCodeOf(null), '');
});

test('isUSCountry treats US and empty as US, others not', () => {
  assert.equal(isUSCountry('United States'), true);
  assert.equal(isUSCountry(''), true);
  assert.equal(isUSCountry(null), true);
  assert.equal(isUSCountry('India'), false);
});

const US_BASE = { city: 'Dallas', state: 'TX', country: 'United States', radiusMiles: 50 };

test('mergeLocation drops stale US city/state when the override changes country', () => {
  // The reported bug: "manufacturing in India" over a Dallas thesis must NOT
  // stay "Dallas, TX, India".
  const out = mergeLocation(US_BASE, { country: 'India' });
  assert.deepEqual(out, { city: '', state: '', country: 'India', radiusMiles: 50 });
});

test('mergeLocation keeps an overridden foreign city, not the base US one', () => {
  const out = mergeLocation(US_BASE, { city: 'Bangalore', country: 'India' });
  assert.equal(out.city, 'Bangalore');
  assert.equal(out.state, ''); // TX must not bleed through
  assert.equal(out.country, 'India');
});

test('mergeLocation shallow-merges same-country tweaks (keeps city)', () => {
  const out = mergeLocation(US_BASE, { country: 'United States', radiusMiles: 100 });
  assert.equal(out.city, 'Dallas'); // same country → city preserved
  assert.equal(out.radiusMiles, 100);
});

test('mergeLocation replaces the city on a same-country city override', () => {
  const out = mergeLocation(US_BASE, { city: 'Austin', state: 'TX', country: 'United States' });
  assert.deepEqual(out, { city: 'Austin', state: 'TX', country: 'United States', radiusMiles: 50 });
});

test('mergeLocation returns the base untouched when there is no override', () => {
  assert.deepEqual(mergeLocation(US_BASE, undefined), US_BASE);
  assert.deepEqual(mergeLocation(US_BASE, {}), US_BASE); // no country in override → merge is a no-op
});
