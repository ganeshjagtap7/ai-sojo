// tests/scrapingPolicy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../lib/scraping/registry';
import { assertPublicSource } from '../lib/scraping/scrapingPolicy';

test('every enabled inline source is on the public-source allowlist', () => {
  for (const s of SOURCES) {
    if (s.runtime === 'inline' && s.enabled) {
      assert.doesNotThrow(
        () => assertPublicSource(s.id),
        `"${s.id}" is enabled+inline but missing from PUBLIC_SOURCES — the compliance gate never sees it`,
      );
    }
  }
});
