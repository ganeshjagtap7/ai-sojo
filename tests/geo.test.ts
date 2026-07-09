import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, countryCodeOf, isUSCountry } from '../lib/geo';

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
