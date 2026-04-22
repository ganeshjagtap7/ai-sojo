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
