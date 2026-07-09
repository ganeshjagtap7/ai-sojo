import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bucketsToCriteria } from '../lib/pipeline/bucketsToCriteria';

test('Southeast + plumbing + $1–3M → Atlanta plumbing $1M-$3M', () => {
  const c = bucketsToCriteria({
    archetype: { id: 'self-funded', name: 'X' },
    facts: { geo: ['Southeast'], check: '$1–3M' },
    buckets: { opening: 'plumbing services', stickiness: 'repeat customers', archetype: 'The consolidator' },
  });
  assert.equal(c.location.city, 'Atlanta');
  assert.equal(c.location.state, 'GA');
  assert.ok(/plumb/i.test(c.industry.primary));
  assert.equal(c.businessSize.revenueMin, 1_000_000);
  assert.equal(c.businessSize.revenueMax, 3_000_000);
});

test('Midwest → Chicago IL', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: { geo: ['Midwest'] },
    buckets: { opening: 'HVAC' },
  });
  assert.equal(c.location.city, 'Chicago');
  assert.equal(c.location.state, 'IL');
});

test('empty geo defaults to Atlanta', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: {},
    buckets: { opening: 'pest control' },
  });
  assert.equal(c.location.city, 'Atlanta');
});

test('no industry-adjacent words → falls back to opening bucket', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: { geo: ['Texas'] },
    buckets: { opening: 'landscaping' },
  });
  assert.ok(c.industry.primary.toLowerCase().includes('landscap'));
});

test('$10M+ maps to 10M min, null max', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: { check: '$10M+' },
    buckets: {},
  });
  assert.equal(c.businessSize.revenueMin, 10_000_000);
  assert.equal(c.businessSize.revenueMax, null);
});

test('TBD check size → null min/max', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: { check: 'TBD' },
    buckets: {},
  });
  assert.equal(c.businessSize.revenueMin, null);
  assert.equal(c.businessSize.revenueMax, null);
});

test('free-text location that is not a US region is treated as a US city', () => {
  // Post-international-search: a non-region single token is a typed city, not
  // silently swapped to Atlanta. Country stays US when nothing signals otherwise.
  const c = bucketsToCriteria({
    archetype: null,
    facts: { geo: ['Foobar'] },
    buckets: { opening: 'coffee shops' },
  });
  assert.equal(c.location.city, 'Foobar');
  assert.equal(c.location.country, 'United States');
});

test('free-text international location resolves the country', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: { geo: ['Mumbai', 'India'] },
    buckets: { opening: 'manufacturing' },
  });
  assert.equal(c.location.city, 'Mumbai');
  assert.equal(c.location.country, 'India');
});

test('multi-geo picks first entry', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: { geo: ['Midwest', 'Southeast'] },
    buckets: {},
  });
  assert.equal(c.location.city, 'Chicago');
});

test('empty-string opening does not produce empty industry.primary', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: {},
    buckets: { opening: '   ' },
  });
  assert.ok(c.industry.primary.length > 0);
  assert.equal(c.industry.primary, 'Business services');
});

test('opening preempts weak "services" keyword in stickiness', () => {
  const c = bucketsToCriteria({
    archetype: null,
    facts: {},
    buckets: { opening: 'coffee shops', stickiness: 'recurring services' },
  });
  assert.ok(c.industry.primary.toLowerCase().includes('coffee'));
  assert.ok(!c.industry.primary.toLowerCase().includes('services'));
});

test('etf archetype maps to traditional searcherType', () => {
  const c = bucketsToCriteria({
    archetype: { id: 'etf', name: 'X' },
    facts: {},
    buckets: {},
  });
  assert.equal(c.searcherType, 'traditional');
});

test('holdco archetype maps to self_funded searcherType', () => {
  const c = bucketsToCriteria({
    archetype: { id: 'holdco', name: 'X' },
    facts: {},
    buckets: {},
  });
  assert.equal(c.searcherType, 'self_funded');
});
