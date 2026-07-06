import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, enabledSources } from '../lib/scraping/registry';

test('every source id is unique', () => {
  const ids = SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('core sources are always-run and enabled', () => {
  for (const id of ['google_maps', 'web_search', 'bbb'] as const) {
    const s = SOURCES.find((x) => x.id === id);
    assert.ok(s, `${id} missing`);
    assert.equal(s!.alwaysRun, true);
    assert.equal(s!.enabled, true);
  }
});

test('playwright sources are disabled until they have an Apify actor', () => {
  for (const id of ['quietlight', 'websiteclosers', 'synergy', 'tobuz', 'trustpilot',
    'investorsclub', 'businessdeals',
    'startupage', 'motioninvest'] as const) {
    const s = SOURCES.find((x) => x.id === id);
    assert.ok(s, `${id} missing`);
    assert.equal(s!.runtime, 'apify');
    assert.equal(s!.enabled, false, `${id} must stay disabled until its actor exists`);
  }
});

test('apify-live sources are enabled and run via Apify', () => {
  for (const id of ['exitbid', 'apppeak', 'indiabiz'] as const) {
    const s = SOURCES.find((x) => x.id === id);
    assert.ok(s, `${id} missing`);
    assert.equal(s!.runtime, 'apify');
    assert.equal(s!.enabled, true, `${id} has a live Apify actor and should be enabled`);
  }
});

test('gated sources are disabled pending compliance sign-off', () => {
  for (const id of ['microns', 'mergerdomo'] as const) {
    const s = SOURCES.find((x) => x.id === id);
    assert.equal(s!.enabled, false);
    assert.equal(s!.gated, true);
  }
});

test('enabledSources filters correctly', () => {
  assert.ok(enabledSources().every((s) => s.enabled));
});
