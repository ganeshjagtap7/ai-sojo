# On-Demand Scraper Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the ~26 already-built scrapers into the live product so a user search (e.g., "plumbing business in Atlanta") routes to the most relevant sources, scrapes them live, and returns merged ranked results — with no scheduler, no VPS, and no separate deployment.

**Architecture:** A **source registry** describes every scraper (region, business kind, runtime, gated). A deterministic **router** picks which sources run for a given `SearchCriteria` (capped per search). The pipeline runs the selected sources in parallel next to the always-on core (Maps/Web/BBB), then feeds everything through the existing dedupe → enrich → rank. Fetch-based scrapers run **inline on Vercel**; Playwright-based scrapers **cannot run on Vercel** and get promoted one-by-one to self-owned **Apify actors** called via API.

**Tech Stack:** TypeScript, Next.js 16 App Router, `apify-client`, node:test + tsx (`npm test`), Supabase auth/rate-limit (already merged on this branch).

---

## Context you must read first (junior-engineer briefing)

**Branch:** work on top of `scrappers` (this branch). It already contains Milestone A (auth, rate limits, friendly errors, SSE search) and all 26 scraper modules in `lib/scraping/`.

**How search works today** ([lib/pipeline/searchPipeline.ts](../../lib/pipeline/searchPipeline.ts)): `runSearchPipeline(criteria, onProgress)` runs exactly 5 hardcoded sources (google_maps, web_search, bbb, yellowpages, manta) via `Promise.allSettled`, merges to `RawLead[]`, dedupes, enriches, ranks. The 26 new scrapers are NOT called from anywhere in the app — only from `scripts/test-*.ts`.

**The three scraper categories** (verified from imports in each file — do not trust this table blindly, re-check the import block of any file you touch):

| Category | Sources | Runtime |
|---|---|---|
| **A. Fetch-based, open (13)** | businessesforsale, businessex, buybiz, esaContractors, franchisegator, hvacinformed, producthunt, serviceExperts, sideprojectors, smedealz, trustmrr, (+ yellowpages, manta already wired) | Inline on Vercel — wire now |
| **B. Fetch-based, gated (2)** | microns, mergerdomo | Inline on Vercel after tokens move to env vars — but keep `enabled: false` pending compliance sign-off (scrapingPolicy is logged-out/public-only; these use buyer logins) |
| **C. Playwright-based (12)** | quietlight, websiteclosers, synergy, tobuz, trustpilot, investorsclub, indiabiz, exitbid, businessdeals, apppeak, startupage (gated), motioninvest (gated) | **CANNOT run on Vercel** (they launch Chrome; some run headed to clear Cloudflare). Registry lists them `runtime: 'apify'`, `enabled: false` until each is wrapped as an Apify actor (Phase 4) |

**Two hard rules:**
1. Never import a Playwright scraper from any file reachable by the Next.js app — the production build will break. The registry references them **lazily** (dynamic import inside `run()`) and they stay `enabled: false` until their Apify actor exists.
2. Every scraper currently ignores its `_criteria` argument and sweeps the whole site. On-demand means: each wired scraper must (a) build the site's own search/category URL from criteria where the site supports it, and (b) cap pages fetched per run. Full-site sweeps are forbidden in the request path.

**New env vars (add to `.env.local` and Vercel project settings as you go):**

```
MAX_EXTRA_SOURCES=4        # routed sources per search, on top of the always-on core
SCRAPER_MAX_PAGES=3        # default list-page cap per scraper per search
SCRAPER_DISABLED_SOURCES=  # comma-separated ids; runtime kill switch per source
MICRONS_TOKEN=             # Phase 3 (leave empty until compliance sign-off)
MERGERDOMO_COOKIES=        # Phase 3 (same)
APIFY_API_TOKEN=           # already set for Google Maps; reused in Phase 4
QUIETLIGHT_ACTOR=          # Phase 4: your actor slug, e.g. youruser/quietlight
```

---

# PHASE 1 — Registry + Router + Pipeline wiring

### Task 1: Source registry

**Files:**
- Create: `lib/scraping/registry.ts`
- Test: `tests/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/registry.test.ts
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
    'investorsclub', 'indiabiz', 'exitbid', 'businessdeals', 'apppeak',
    'startupage', 'motioninvest'] as const) {
    const s = SOURCES.find((x) => x.id === id);
    assert.ok(s, `${id} missing`);
    assert.equal(s!.runtime, 'apify');
    assert.equal(s!.enabled, false, `${id} must stay disabled until its actor exists`);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/registry.test.ts` (from the repo root — remember the parent dir has a trailing space, quote paths)
Expected: FAIL — `Cannot find module '../lib/scraping/registry'`

- [ ] **Step 3: Implement the registry**

```ts
// lib/scraping/registry.ts
import { SearchCriteria, RawLead } from '@/lib/types';
import { generateSearchQueries } from '@/lib/ai/queryGenerator';

export type GeneratedQueries = Awaited<ReturnType<typeof generateSearchQueries>>;

export interface SourceRunContext {
  criteria: SearchCriteria;
  queries: GeneratedQueries;
}

export interface SourceDef {
  id: RawLead['source'];
  label: string;
  /** Where this source's inventory lives. */
  region: 'us' | 'india' | 'global';
  /** What kind of leads it produces — drives routing. */
  kind: 'local_business' | 'deal_listing' | 'micro_saas' | 'franchise' | 'niche_directory';
  /** Industry tags this source is good for. 'any' matches everything. */
  industries: 'any' | 'digital' | string[];
  /** inline = runs in the Vercel function; apify = called via Apify API. */
  runtime: 'inline' | 'apify';
  /** Requires a logged-in session/token. */
  gated: boolean;
  /** Runs on every search regardless of routing (the original core). */
  alwaysRun?: boolean;
  enabled: boolean;
  run: (ctx: SourceRunContext) => Promise<RawLead[]>;
}

/**
 * Lazy dynamic imports keep Playwright-based modules out of the Next.js
 * bundle. NEVER convert these to top-level imports — Playwright cannot load
 * on Vercel and the build will break.
 */
export const SOURCES: SourceDef[] = [
  // ── Always-on core (existing behavior, unchanged) ──────────────────────
  {
    id: 'google_maps', label: 'Google Maps', region: 'global', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) =>
      (await import('@/lib/scraping/googleMaps')).scrapeGoogleMaps(queries.googleMaps, criteria.location),
  },
  {
    id: 'web_search', label: 'Web search', region: 'global', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ queries }) => (await import('@/lib/scraping/webSearch')).scrapeWebSearch(queries.webSearch),
  },
  {
    id: 'bbb', label: 'BBB', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) => (await import('@/lib/scraping/bbb')).scrapeBBB(queries.bbb, criteria.location),
  },
  // ── Routed US local-business directories (were always-on; now routed) ──
  {
    id: 'yellowpages', label: 'YellowPages', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria, queries }) =>
      (await import('@/lib/scraping/yellowpages')).scrapeYellowPages(queries.yellowpages, criteria.location),
  },
  {
    id: 'manta', label: 'Manta', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/manta')).scrapeManta(criteria),
  },
  // ── Routed deal-listing sources — fetch-based, wire now ────────────────
  {
    id: 'businessesforsale', label: 'BusinessesForSale', region: 'us', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) =>
      (await import('@/lib/scraping/businessesforsale')).scrapeBusinessesForSale(criteria),
  },
  {
    id: 'businessex', label: 'BusinessEx', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/businessex')).scrapeBusinessEx(criteria),
  },
  {
    id: 'buybiz', label: 'BuyBiz', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/buybiz')).scrapeBuyBiz(criteria),
  },
  {
    id: 'smedealz', label: 'smeDealz', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/smedealz')).scrapeSmeDealz(criteria),
  },
  {
    id: 'franchisegator', label: 'FranchiseGator', region: 'us', kind: 'franchise',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/franchisegator')).scrapeFranchiseGator(criteria),
  },
  {
    id: 'sideprojectors', label: 'SideProjectors', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/sideprojectors')).scrapeSideProjectors(criteria),
  },
  {
    id: 'trustmrr', label: 'TrustMRR', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/trustmrr')).scrapeTrustMrr(criteria),
  },
  // ── Niche directories — router only picks them for matching industries ─
  {
    id: 'hvacinformed', label: 'HVACinformed', region: 'us', kind: 'niche_directory',
    industries: ['hvac', 'heating', 'cooling', 'air conditioning'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/hvacinformed')).scrapeHvacInformed(criteria),
  },
  {
    id: 'esa', label: 'ESA Contractors', region: 'us', kind: 'niche_directory',
    industries: ['security', 'alarm', 'fire'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/esaContractors')).scrapeEsaContractors(criteria),
  },
  {
    id: 'serviceexperts', label: 'Service Experts', region: 'us', kind: 'niche_directory',
    industries: ['hvac', 'plumbing', 'heating', 'cooling'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/serviceExperts')).scrapeServiceExperts(criteria),
  },
  {
    id: 'producthunt', label: 'Product Hunt', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/producthunt')).scrapeProductHunt(criteria),
  },
  // ── Gated fetch sources — DISABLED pending compliance sign-off (Phase 3) ─
  {
    id: 'microns', label: 'Microns', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: true, enabled: false,
    run: async ({ criteria }) => (await import('@/lib/scraping/microns')).scrapeMicrons(criteria),
  },
  {
    id: 'mergerdomo', label: 'MergerDomo', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: true, enabled: false,
    run: async ({ criteria }) => (await import('@/lib/scraping/mergerdomo')).scrapeMergerDomo(criteria),
  },
  // ── Playwright sources — DISABLED until each has an Apify actor (Phase 4) ─
  // runtime:'apify' means "will be called via Apify"; run() throws until then.
  ...([
    ['quietlight', 'Quiet Light', 'us', 'deal_listing', 'digital'],
    ['websiteclosers', 'Website Closers', 'us', 'deal_listing', 'digital'],
    ['synergy', 'Synergy Business Brokers', 'us', 'deal_listing', 'any'],
    ['tobuz', 'Tobuz', 'india', 'deal_listing', 'any'],
    ['trustpilot', 'Trustpilot', 'global', 'niche_directory', 'any'],
    ['investorsclub', 'Investors Club', 'global', 'micro_saas', 'digital'],
    ['indiabiz', 'IndiaBizForSale', 'india', 'deal_listing', 'any'],
    ['exitbid', 'ExitBid', 'global', 'micro_saas', 'digital'],
    ['businessdeals', 'BusinessDeals.in', 'india', 'deal_listing', 'any'],
    ['apppeak', 'AppPeak', 'global', 'micro_saas', 'digital'],
    ['startupage', 'StartuPage', 'global', 'micro_saas', 'digital'],
    ['motioninvest', 'Motion Invest', 'global', 'micro_saas', 'digital'],
  ] as const).map(([id, label, region, kind, industries]): SourceDef => ({
    id: id as RawLead['source'], label, region, kind,
    industries: industries === 'any' ? 'any' : 'digital',
    runtime: 'apify',
    gated: id === 'startupage' || id === 'motioninvest',
    enabled: false,
    run: async () => {
      throw new Error(`${id} runs via Apify actor — not yet deployed (see Phase 4 of the plan)`);
    },
  })),
];

export function enabledSources(): SourceDef[] {
  const killed = (process.env.SCRAPER_DISABLED_SOURCES || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return SOURCES.filter((s) => s.enabled && !killed.includes(s.id));
}
```

- [ ] **Step 4: Fix the export names.** The `run` lambdas above guess each scraper's exported function name. Open each of the 15 non-core scraper files listed and copy the EXACT export name (e.g., `grep "export async function" lib/scraping/smedealz.ts`). Fix any mismatches. TypeScript will also catch them: run `npx tsc --noEmit`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/registry.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/scraping/registry.ts tests/registry.test.ts
git commit -m "feat: source registry describing all 30 scraper sources"
```

---

### Task 2: Router (`selectSources`)

**Files:**
- Create: `lib/scraping/router.ts`
- Test: `tests/router.test.ts`

- [ ] **Step 1: Write the failing tests** — these encode the routing rules; they are the spec:

```ts
// tests/router.test.ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/router.test.ts`
Expected: FAIL — `Cannot find module '../lib/scraping/router'`

- [ ] **Step 3: Implement the router**

```ts
// lib/scraping/router.ts
import { SearchCriteria } from '@/lib/types';
import { SourceDef, enabledSources } from './registry';

const DIGITAL_TERMS = ['saas', 'software', 'app', 'ecommerce', 'e-commerce', 'online',
  'content', 'newsletter', 'agency', 'marketplace', 'amazon fba', 'shopify', 'domain',
  'website', 'digital', 'mobile', 'internet'];

export function isDigitalIndustry(industry: SearchCriteria['industry']): boolean {
  const hay = [industry.primary, ...industry.subSectors, ...industry.keywords]
    .join(' ').toLowerCase();
  return DIGITAL_TERMS.some((t) => hay.includes(t));
}

function isUS(loc: SearchCriteria['location']): boolean {
  const c = loc.country.trim().toLowerCase();
  return c === '' || c === 'us' || c === 'usa' || c === 'united states';
}

function isIndia(loc: SearchCriteria['location']): boolean {
  return loc.country.trim().toLowerCase() === 'india';
}

function industryTagMatch(tags: string[], industry: SearchCriteria['industry']): boolean {
  const hay = [industry.primary, ...industry.subSectors, ...industry.keywords]
    .join(' ').toLowerCase();
  return tags.some((t) => hay.includes(t));
}

/**
 * Deterministic source selection. Returns alwaysRun sources plus up to
 * MAX_EXTRA_SOURCES routed extras, in registry priority order.
 * Rules per source, all of which must hold for it to be picked:
 *  - region: 'us' sources only for US searches; 'india' only for India; 'global' always.
 *  - industries: 'any' matches all; 'digital' requires isDigitalIndustry;
 *    a tag array requires a tag match (niche directories).
 *  - kind 'local_business' extras (yellowpages/manta) require a non-digital,
 *    located search — they index physical businesses.
 *  - kind 'micro_saas' requires a digital search.
 */
export function selectSources(criteria: SearchCriteria): SourceDef[] {
  const cap = parseInt(process.env.MAX_EXTRA_SOURCES || '4', 10);
  const all = enabledSources();
  const core = all.filter((s) => s.alwaysRun);
  const digital = isDigitalIndustry(criteria.industry);

  const extras = all.filter((s) => {
    if (s.alwaysRun) return false;
    if (s.region === 'us' && !isUS(criteria.location)) return false;
    if (s.region === 'india' && !isIndia(criteria.location)) return false;
    if (s.industries === 'digital' && !digital) return false;
    if (Array.isArray(s.industries) && !industryTagMatch(s.industries, criteria.industry)) return false;
    if (s.kind === 'local_business' && (digital || !criteria.location.city)) return false;
    if (s.kind === 'micro_saas' && !digital) return false;
    if (s.kind === 'franchise' && !industryTagMatch(['franchise'], criteria.industry)) return false;
    return true;
  }).slice(0, cap);

  return [...core, ...extras];
}
```

- [ ] **Step 4: Run tests until green.** `npm test -- tests/router.test.ts`. If the plumbing test picks different extras than asserted (cap order), the fix is registry ORDER — deal_listing sources should come before niche directories in `SOURCES`. Adjust the registry array order, not the tests.

- [ ] **Step 5: Commit**

```bash
git add lib/scraping/router.ts tests/router.test.ts
git commit -m "feat: deterministic source router with region/industry rules + cap"
```

---

### Task 3: Pipeline uses registry + router

**Files:**
- Modify: `lib/pipeline/searchPipeline.ts` (replace the hardcoded 5-source block)
- Modify: `app/app/_components/Workspace.tsx` (only if it hardcodes "of 5" — check)

- [ ] **Step 1: Change `ProgressEvent` total to a number**

In `lib/pipeline/searchPipeline.ts`, change:

```ts
  | { phase: 'source'; source: string; ok: boolean; index: number; total: 5 }
```
to:
```ts
  | { phase: 'source'; source: string; ok: boolean; index: number; total: number }
```

- [ ] **Step 2: Replace the hardcoded source block.** Delete the imports of the 5 scrapers and the `sources` array construction, the five named `allSettled` destructures, the five `console.error` lines, the five-entry `rawLeads` spread, the five-entry `reasons` array, and the five-entry `sourcesUsed` array. Replace with:

```ts
import { selectSources } from '@/lib/scraping/router';
// (keep the other imports: types, queryGenerator, deduplicator, enricher, ranker, NO_RESULTS)

  const picked = selectSources(criteria);
  console.log(`[Pipeline] Routed sources: ${picked.map((s) => s.id).join(', ')}`);

  const total = picked.length;
  const runs = picked.map((def, i) => ({
    def,
    index: i + 1,
    promise: def.run({ criteria, queries }),
  }));

  for (const { def, index, promise } of runs) {
    promise
      .then(() => onProgress({ phase: 'source', source: def.id, ok: true, index, total }))
      .catch(() => onProgress({ phase: 'source', source: def.id, ok: false, index, total }));
  }

  const settled = await Promise.allSettled(runs.map((r) => r.promise));

  settled.forEach((res, i) => {
    if (res.status === 'rejected') {
      console.error(`[Pipeline] ${runs[i].def.label} scraper failed:`, res.reason);
    }
  });

  const rawLeads: RawLead[] = settled.flatMap((res) =>
    res.status === 'fulfilled' ? res.value : []);

  console.log(`[Pipeline] Raw leads collected: ${rawLeads.length}`);

  if (rawLeads.length === 0) {
    const reasons = settled
      .map((res, i) => res.status === 'rejected'
        ? `${runs[i].def.label}: ${(res.reason as Error)?.message || res.reason}` : null)
      .filter(Boolean).join('; ');
    if (reasons) console.error('[Pipeline] No raw leads; source reasons:', reasons);
    throw new Error(NO_RESULTS);
  }
```

And `sourcesUsed` becomes:

```ts
  const sourcesUsed: string[] = settled
    .map((res, i) => (res.status === 'fulfilled' && res.value.length > 0 ? runs[i].def.id : null))
    .filter((x): x is string => x !== null);
```

- [ ] **Step 3: Check the UI for a hardcoded total.** Run `grep -n "of 5\|total" app/app/_components/Workspace.tsx`. If the progress label uses the event's `total` field, no change. If it hardcodes 5, make it render `event.total`.

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck; all tests PASS.

- [ ] **Step 5: Manual smoke test.** `npm run dev`, log in, run a search for "plumbing business in Atlanta" from the workspace. Watch the terminal: you should see `[Pipeline] Routed sources: google_maps, web_search, bbb, yellowpages, businessesforsale, ...` and a results board. (businessesforsale may return 0 or be slow until Task 5 makes it criteria-aware — failures are tolerated by allSettled.)

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/searchPipeline.ts app/app/_components/Workspace.tsx
git commit -m "feat: pipeline runs router-selected sources instead of hardcoded 5"
```

---

# PHASE 2 — Make wired scrapers criteria-aware (no full-site sweeps)

The pattern is identical for every fetch-based scraper; Task 4 is the fully-worked example. **The scraper must (1) build the site's own search/category URL from `criteria`, (2) fetch at most `SCRAPER_MAX_PAGES` list pages, (3) still return `RawLead[]` exactly as before.** You cannot know a site's URL scheme from this document — you must discover it in the browser and record it in the code comment.

### Task 4: `businessesforsale.ts` criteria-aware (worked example)

**Files:**
- Modify: `lib/scraping/businessesforsale.ts`
- Verify with: `scripts/test-businessesforsale.ts`

- [ ] **Step 1: Discover the search URL scheme.** In a normal browser open `https://us.businessesforsale.com`, run a search for a category ("Plumbing") + location ("Georgia"), and copy the resulting URL. Record BOTH the category-only and category+state forms as a comment at the top of the file. (Expected shape, verify before trusting: `https://us.businessesforsale.com/us/search/plumbing-businesses-for-sale-in-georgia` — slugified terms.)

- [ ] **Step 2: Implement `buildSearchPath(criteria)` in the file**

```ts
const slug = (s: string) => s.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Maps criteria to the site's own search path; falls back to the generic feed. */
function buildSearchPath(criteria?: SearchCriteria): string {
  const industry = criteria?.industry.primary ? slug(criteria.industry.primary) : '';
  const state = criteria?.location.state ? slug(stateFullName(criteria.location.state)) : '';
  if (industry && state) return `/us/search/${industry}-businesses-for-sale-in-${state}`;
  if (industry) return `/us/search/${industry}-businesses-for-sale`;
  return '/us/search/businesses-for-sale';
}
```

`stateFullName` maps "GA" → "georgia": add a `const US_STATES: Record<string,string>` with all 50 entries (copy a standard list) into `lib/utils/usStates.ts` and import it — Task 5's scrapers reuse it.

- [ ] **Step 3: Rename `_criteria` → `criteria` and use it.** Change the signature to `scrapeBusinessesForSale(criteria?: SearchCriteria)`, replace the hardcoded `BASE` list URL with `SITE + buildSearchPath(criteria)`, and cap pagination: replace the `BFSALE_LIMIT`-driven "scrape ALL" loop bound with `Math.min(existingBound, parseInt(process.env.SCRAPER_MAX_PAGES || '3', 10))` pages.

- [ ] **Step 4: Verify against the live site**

Run: `npx tsx scripts/test-businessesforsale.ts` after editing that script to pass a criteria object (`{ industry: { primary: 'plumbing', ... }, location: { state: 'GA', ... } }` — copy the `crit()` helper from `tests/router.test.ts`).
Expected: >0 leads, all plumbing-related titles, run completes in <30s (not the multi-minute full sweep).

- [ ] **Step 5: Commit**

```bash
git add lib/scraping/businessesforsale.ts lib/utils/usStates.ts scripts/test-businessesforsale.ts
git commit -m "feat: businessesforsale scraper targets criteria search URL, page-capped"
```

### Task 5: Repeat for the remaining wired fetch scrapers

Same 5 steps as Task 4 for each. One commit per scraper: `feat: <source> scraper criteria-aware + page-capped`. Discovery notes:

- [ ] `smedealz.ts` — check if the site has industry/location filters; if it has none, apply only the page cap and note `// site has no search; page-capped feed only` in the file.
- [ ] `buybiz.ts` — India: map `criteria.location.city` and industry to its filter URL if present; else page cap only.
- [ ] `businessex.ts` — same as buybiz.
- [ ] `franchisegator.ts` — has industry categories and state pages; map both.
- [ ] `sideprojectors.ts` — has project-type filters (SaaS/app/domain); map from industry keywords.
- [ ] `trustmrr.ts` — likely no filters; page cap only.
- [ ] `producthunt.ts`, `hvacinformed.ts`, `esaContractors.ts`, `serviceExperts.ts` — already niche (the router only picks them for matching industries); page cap only, skip URL mapping.
- [ ] `yellowpages.ts`, `manta.ts` — already criteria-aware (they take queries/criteria); confirm they cap pages, no other change.

**Done-when for Phase 2:** every `enabled: true, runtime: 'inline'` source in the registry either uses criteria in its URL or carries the `// site has no search` comment, and none can fetch more than `SCRAPER_MAX_PAGES` list pages per run.

---

# PHASE 3 — Gated sources: tokens to env (KEEP DISABLED until sign-off)

> ⚠️ `lib/scraping/scrapingPolicy.ts` commits us to logged-out/public-only scraping. Microns and MergerDomo use logged-in buyer sessions, which conflicts. Do the token plumbing now (it's cheap), but **do not set `enabled: true` in the registry until Ganesh explicitly signs off.**

### Task 6: Microns + MergerDomo tokens from env

**Files:**
- Modify: `lib/scraping/microns.ts`, `lib/scraping/mergerdomo.ts`

- [ ] **Step 1: Env-first token lookup in `microns.ts`** — replace the body of `getToken()`:

```ts
function getToken(): string {
  if (process.env.MICRONS_TOKEN) return process.env.MICRONS_TOKEN;
  // Local-dev fallback: session file captured by scripts/microns-login.ts
  if (!existsSync(AUTH_FILE)) throw new Error('Set MICRONS_TOKEN or run: npx tsx scripts/microns-login.ts');
  const state = JSON.parse(readFileSync(AUTH_FILE, 'utf8')) as { cookies?: { name: string; value: string }[] };
  const tok = (state.cookies || []).find((c) => c.name === 'token');
  if (!tok) throw new Error('No `token` cookie in microns-auth.json — re-run scripts/microns-login.ts');
  return decodeURIComponent(tok.value);
}
```

- [ ] **Step 2: Same pattern in `mergerdomo.ts`** — find its auth-file read (grep `AUTH_FILE`) and add an `MERGERDOMO_COOKIES` env-first branch that accepts the serialized cookie string the login script captures. Update `scripts/mergerdomo-login.ts` to `console.log` the exact value to paste into the env var (and do the same in `scripts/microns-login.ts` for `MICRONS_TOKEN`).

- [ ] **Step 3: Verify** — `MICRONS_TOKEN=<paste> npx tsx scripts/test-microns.ts` returns leads with no auth file present (temporarily rename `microns-auth.json`).

- [ ] **Step 4: Confirm auth files are gitignored** — `git check-ignore microns-auth.json mergerdomo-auth.json` must print both names. If not, add them to `.gitignore` in this commit.

- [ ] **Step 5: Commit**

```bash
git add lib/scraping/microns.ts lib/scraping/mergerdomo.ts scripts/microns-login.ts scripts/mergerdomo-login.ts .gitignore
git commit -m "feat: gated scrapers read session tokens from env (still disabled pending sign-off)"
```

---

# PHASE 4 — Playwright scrapers → self-owned Apify actors

These 12 cannot run on Vercel. Each gets promoted individually; until then it stays `enabled: false` and costs nothing. **Order by deal value: quietlight → websiteclosers → synergy → indiabiz → tobuz → investorsclub → exitbid → businessdeals → apppeak → trustpilot. Hold startupage + motioninvest (gated) for the same compliance sign-off as Phase 3.**

### Task 7: Generic Apify runner

**Files:**
- Create: `lib/scraping/apifyRunner.ts`
- Test: `tests/apifyRunner.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/apifyRunner.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capItems } from '../lib/scraping/apifyRunner';

test('capItems truncates and filters null-ish', () => {
  const items = [{ a: 1 }, null, { a: 2 }, { a: 3 }];
  assert.deepEqual(capItems(items as never[], 2), [{ a: 1 }, { a: 2 }]);
});
```

- [ ] **Step 2: Run** `npm test -- tests/apifyRunner.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/scraping/apifyRunner.ts
import { ApifyClient } from 'apify-client';
import { RawLead } from '@/lib/types';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export function capItems<T>(items: (T | null)[], max: number): T[] {
  return items.filter((x): x is T => x != null).slice(0, max);
}

/**
 * Run one of OUR actors (which push RawLead-shaped items to their dataset)
 * and return the leads. Mirrors the pattern in lib/scraping/googleMaps.ts.
 */
export async function runApifyScraper(
  actorSlug: string,
  input: Record<string, unknown>,
  opts: { timeoutSecs?: number; maxItems?: number } = {},
): Promise<RawLead[]> {
  const { timeoutSecs = 180, maxItems = 200 } = opts;
  const run = await client.actor(actorSlug).call(input, { waitSecs: timeoutSecs });
  console.log(`[Apify:${actorSlug}] run=${run.id} status=${run.status}`);
  if (run.status !== 'SUCCEEDED') {
    await client.run(run.id).abort().catch(() => {});
    throw new Error(`[Apify:${actorSlug}] run ${run.status}`);
  }
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: maxItems });
  return capItems(items as unknown as RawLead[], maxItems);
}
```

- [ ] **Step 4: Run** `npm test -- tests/apifyRunner.test.ts` — PASS.

- [ ] **Step 5: Commit** — `git add lib/scraping/apifyRunner.ts tests/apifyRunner.test.ts && git commit -m "feat: generic runner for self-owned Apify actors"`

### Task 8: First actor — Quiet Light (worked example)

**Files:** new standalone dir `apify-actors/quietlight/` at the repo root (actors deploy to Apify, not Vercel — keep them out of the Next.js graph).

- [ ] **Step 1: Install the Apify CLI and log in** — `npm i -g apify-cli && apify login` (token from the Apify console; same account as `APIFY_API_TOKEN`).

- [ ] **Step 2: Scaffold** — `cd apify-actors && apify create quietlight --template playwright-crawler-ts` (accept defaults; if the template name differs, pick the Playwright + TypeScript one from the list the CLI shows).

- [ ] **Step 3: Port the scraper.** Replace the template's crawl logic in `src/main.ts` with the existing logic from `lib/scraping/quietlight.ts`: goto `https://quietlight.com/listings/`, wait for `.listing-card`, run the SAME `page.evaluate` card-extraction (copy it verbatim), map cards to `RawLead` objects using the SAME mapping code (copy `parseMoney` and the card→RawLead block), then `await Actor.pushData(leads)`. Two changes from the local version: `headless: true`, and enable Apify proxy:

```ts
const proxyConfiguration = await Actor.createProxyConfiguration({
  groups: ['RESIDENTIAL'],
  countryCode: 'US',
});
```

(Residential proxy is what clears Cloudflare instead of the headed browser trick.)

- [ ] **Step 4: Test on Apify** — `apify push` then run it from the Apify console with empty input `{}`. Expected: run SUCCEEDED, dataset contains listing items with `businessName`, `askingPrice`, `sourceUrl`, `source: 'quietlight'`. Note your actor's slug (`<your-username>/quietlight`).

- [ ] **Step 5: Point the registry at it.** In `lib/scraping/registry.ts` replace the quietlight placeholder entry's `run` and flip it on:

```ts
  {
    id: 'quietlight', label: 'Quiet Light', region: 'us', kind: 'deal_listing',
    industries: 'digital', runtime: 'apify', gated: false, enabled: true,
    run: async () => (await import('@/lib/scraping/apifyRunner')).runApifyScraper(
      process.env.QUIETLIGHT_ACTOR || '<your-username>/quietlight', {}),
  },
```

(Remove `quietlight` from the disabled-until-actor list in `tests/registry.test.ts` — move it to a new `apify-live` assertion group.)

- [ ] **Step 6: End-to-end check** — `npm run dev`, search a SaaS thesis, confirm `[Apify:...quietlight] run=... status=SUCCEEDED` in the logs and Quiet Light listings on the board.

- [ ] **Step 7: Commit** — `git add apify-actors/quietlight lib/scraping/registry.ts tests/registry.test.ts && git commit -m "feat: Quiet Light live via self-owned Apify actor"`

### Task 9: Remaining Playwright sources

- [ ] Repeat Task 8's steps for each, one commit each, in the value order listed at the top of Phase 4: `websiteclosers`, `synergy`, `indiabiz`, `tobuz`, `investorsclub`, `exitbid`, `businessdeals`, `apppeak`, `trustpilot`.
- [ ] For each: check its file header first — some may not actually need residential proxy (try datacenter first; residential costs more).
- [ ] `startupage`, `motioninvest`: BLOCKED on the same compliance sign-off as Phase 3 (they're login-gated). Skip until told otherwise.

---

# PHASE 5 — Acceptance

- [ ] **A1. Plumbing in Atlanta (US local):** search via the UI. Expect: routed sources logged as core + yellowpages/manta + businessesforsale + serviceexperts (order/cap-dependent); results include both off-market plumbers and for-sale listings; total time < 2 minutes.
- [ ] **A2. SaaS thesis (digital):** expect trustmrr/sideprojectors (+ quietlight if Phase 4 Task 8 done); no yellowpages/manta.
- [ ] **A3. India retail:** expect smedealz/buybiz/businessex; no US-only sources.
- [ ] **A4. Kill switch:** set `SCRAPER_DISABLED_SOURCES=businessesforsale` in `.env.local`, rerun A1, confirm it's absent from the routed-sources log.
- [ ] **A5. CI:** `npx tsc --noEmit && npm test` green locally and in the GitHub Actions run on your PR.
- [ ] **A6. Vercel deploy:** after merge, run A1 in production. If any inline scraper 403s (site blocking Vercel IPs), that's expected for some sites — log it, set it `enabled: false`, and add it to the Phase 4 promotion queue instead. Do NOT try to defeat the block from Vercel (scrapingPolicy forbids circumvention).

---

## Out of scope (do not build)

- The 8 Tier A marketplaces via third-party Apify actors (Acquire, Flippa, BizBuySell, BizQuest, Empire Flippers, SMERGERS, LoopNet, IBBA) — separate approved spec: `docs/superpowers/specs/2026-07-03-apify-marketplace-actors-design.md` (on `main`), tracked as GAN-78. Note: Phase 1's registry is designed so those plug in later as more `SourceDef` entries.
- Any scheduler, cron, listings database, or caching layer — explicitly deferred; everything is live per-search.
- LLM-based routing — the router stays deterministic rules; revisit only if the rules prove too crude.
- Enabling gated sources (microns, mergerdomo, startupage, motioninvest) — blocked on compliance sign-off.
