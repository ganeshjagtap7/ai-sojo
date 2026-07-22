import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { OnboardSchema } from '../lib/flow/onboardSchema';

// Regression for the "Invalid payload" signup bug: a new user hits the onboarding
// handoff with a persisted FlowState whose thesis (and often archetype) is null.
// Zod v4 `.optional()` rejects null — `.nullable()` is what makes these pass.

test('thesis: null is accepted (new-user / mid-wizard state) — the bug fix', () => {
  const r = OnboardSchema.safeParse({
    stage: 3,
    archetype: { id: 'exploring', name: 'Exploring' },
    facts: { geo: ['Texas'] },
    buckets: {},
    thesis: null,
    progressMode: 'auto',
    leads: [],
  });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error?.issues));
});

test('archetype: null is accepted (fresh state)', () => {
  const r = OnboardSchema.safeParse({ archetype: null, facts: {}, buckets: {}, thesis: null });
  assert.equal(r.success, true);
});

test('a completed wizard payload is accepted', () => {
  const r = OnboardSchema.safeParse({
    stage: 6,
    archetype: { id: 'self-funded', name: 'Self-Funded Searcher' },
    facts: { capital: 'Self-funded', check: '$1–3M', geo: ['Southeast'] },
    buckets: { opening: 'HVAC services' },
    thesis: { paragraph: 'p', sharpening: 's', disqualifiers: ['no restaurants'], headline: 'h', archetypeLabel: 'Self-Funded', flag: null },
    progressMode: 'done',
    leads: [],
  });
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error?.issues));
});

test('empty payload is accepted (returning-user no-op)', () => {
  assert.equal(OnboardSchema.safeParse({}).success, true);
});

test('genuinely malformed payload is still rejected', () => {
  // thesis.disqualifiers must be string[] — an object here is a real error.
  const r = OnboardSchema.safeParse({ thesis: { disqualifiers: { nope: true } } });
  assert.equal(r.success, false);
});

test('extra FlowState fields (stage, leads, progressMode) are ignored, not rejected', () => {
  const r = OnboardSchema.safeParse({ stage: 6, progressMode: 'done', leads: [{ any: 'thing' }], thesis: null });
  assert.equal(r.success, true);
});
