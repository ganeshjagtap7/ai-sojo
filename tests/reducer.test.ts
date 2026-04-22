import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { reducer } from '../lib/flow/reducer';
import { INITIAL_STATE, type FlowState } from '../lib/flow/types';

test('SET_STAGE clamps to 0-7', () => {
  const s = reducer(INITIAL_STATE, { type: 'SET_STAGE', stage: 3 });
  assert.equal(s.stage, 3);
});

test('SET_ARCHETYPE stores archetype', () => {
  const s = reducer(INITIAL_STATE, {
    type: 'SET_ARCHETYPE',
    archetype: { id: 'traditional', name: 'Jane' },
  });
  assert.equal(s.archetype?.id, 'traditional');
  assert.equal(s.archetype?.name, 'Jane');
});

test('SET_FACTS merges facts', () => {
  let s: FlowState = INITIAL_STATE;
  s = reducer(s, { type: 'SET_FACTS', facts: { capital: 'Self-funded' } });
  s = reducer(s, { type: 'SET_FACTS', facts: { check: '$1–3M' } });
  assert.equal(s.facts.capital, 'Self-funded');
  assert.equal(s.facts.check, '$1–3M');
});

test('PATCH_BUCKETS merges buckets', () => {
  let s: FlowState = INITIAL_STATE;
  s = reducer(s, { type: 'PATCH_BUCKETS', patch: { opening: 'recession-resistant' } });
  s = reducer(s, { type: 'PATCH_BUCKETS', patch: { stickiness: 'contracts' } });
  assert.equal(s.buckets.opening, 'recession-resistant');
  assert.equal(s.buckets.stickiness, 'contracts');
});

test('START_SEARCH clears prior search state', () => {
  const s = reducer(
    { ...INITIAL_STATE, searchError: 'prev', leads: [{ id: 'x' } as never] },
    { type: 'START_SEARCH', jobId: 'srch_1' }
  );
  assert.equal(s.jobId, 'srch_1');
  assert.equal(s.searchError, null);
  assert.deepEqual(s.leads, []);
});

test('RESTART returns to initial', () => {
  const dirty: FlowState = {
    ...INITIAL_STATE,
    stage: 5,
    archetype: { id: 'self-funded', name: 'x' },
    buckets: { opening: 'a' },
  };
  const s = reducer(dirty, { type: 'RESTART' });
  assert.deepEqual(s, INITIAL_STATE);
});
