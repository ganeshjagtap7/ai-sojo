import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SOURCES, enabledSources } from '../lib/scraping/registry';
import { capItems } from '../lib/scraping/apifyRunner';

// The 10 self-owned browser scrapers wired via deployedApify (env-gated).
const CUSTOM = [
  'quietlight', 'websiteclosers', 'synergy', 'tobuz', 'trustpilot',
  'investorsclub', 'indiabiz', 'exitbid', 'businessdeals', 'apppeak',
] as const;

test('capItems drops nulls and caps to max', () => {
  assert.deepEqual(capItems([1, null, 2, null, 3], 2), [1, 2]);
  assert.deepEqual(capItems([null, null], 5), []);
});

test('SAFETY: with no *_ACTOR env set, every custom actor is disabled', () => {
  // Mirrors production today (no *_ACTOR envs) → merging this changes nothing.
  for (const id of CUSTOM) {
    const s = SOURCES.find((x) => x.id === id);
    assert.ok(s, `${id} should be registered`);
    assert.equal(s!.enabled, false, `${id} must be disabled when its env var is unset`);
  }
});

test('SAFETY: disabled custom actors are excluded from enabledSources()', () => {
  const ids = new Set(enabledSources().map((s) => s.id));
  for (const id of CUSTOM) {
    assert.ok(!ids.has(id), `${id} must not be routed while disabled`);
  }
});

test('WIRING IS REAL: each custom actor reads its *_ACTOR env (not a dead stub)', async () => {
  // When the env var is unset, run() should complain about THAT specific env var —
  // proving it will call the deployed actor once the var is set (unlike the
  // permanent "not deployed yet" stubs).
  const cases: Record<string, RegExp> = {
    synergy: /SYNERGY_ACTOR not set/,
    quietlight: /QUIETLIGHT_ACTOR not set/,
    tobuz: /TOBUZ_ACTOR not set/,
  };
  for (const [id, re] of Object.entries(cases)) {
    const s = SOURCES.find((x) => x.id === id)!;
    assert.equal(s.runtime, 'apify');
    await assert.rejects(() => s.run({} as never), re, `${id} should reference its env var`);
  }
});

test('compliance-blocked stubs stay permanent stubs (startupage, motioninvest)', async () => {
  for (const id of ['startupage', 'motioninvest'] as const) {
    const s = SOURCES.find((x) => x.id === id)!;
    assert.equal(s.enabled, false);
    await assert.rejects(() => s.run({} as never), /not deployed yet/);
  }
});
