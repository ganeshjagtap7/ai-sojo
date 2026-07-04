# Build Spec: Apify Marketplace Actor Integration (Tier A Sources)

**Date:** 2026-07-03
**Status:** Approved design, ready for implementation
**Owner:** Ganesh (product) / assigned engineer (build)
**Repo:** `ai-sojo`

---

## 1. What we are building

When a user runs a search in ai-sojo, the search pipeline currently scrapes Google Maps, web search, and BBB. This project adds **business-for-sale marketplace listings** as a fourth source class, pulled **on-demand per search** from 8 Tier A platforms via their dedicated Apify actors:

| # | Platform | Focus | Actor status |
|---|----------|-------|--------------|
| 1 | Acquire.com | Global SaaS / digital startups | Confirmed: `vsekar91/acquire-startup-scraper` |
| 2 | Flippa | Sites, apps, content, domains | Confirmed: `parseforge/flippa-scraper` |
| 3 | BizBuySell | US SMB (largest US marketplace) | Confirmed: `acquistion-automation/bizbuysell-scraper` |
| 4 | Empire Flippers | Curated/vetted SaaS & content | Confirmed: `piotrv1001/empire-flippers-scraper` |
| 5 | BizQuest | US SMB (BizBuySell sister site) | **Verified 2026-07-04:** `parseforge/bizquest-scraper` (updated 2026-05-08; filters: location/industry/price/cash-flow) |
| 6 | SMERGERS | India + international SME M&A | **Found 2026-07-04:** Lexis Solutions (certified Apify partner) lists a "Smergers Business Listing Scraper" — confirm exact slug in the Apify console (search "smergers") before building |
| 7 | LoopNet / Crexi | US commercial RE + business-with-property | **Verified 2026-07-04:** `parseforge/loopnet-scraper` (pay-per-result ~$0.005/property); avoid `epctex/loopnet-scraper` (DEPRECATED) |
| 8 | IBBA Member Directory | US broker aggregator (2,800+ brokers) | **Verified 2026-07-04:** `jungle_synthesizer/business-broker-directory-scraper` (26 fields/broker, 99.9% email coverage, ~$2.90 full pull, state/industry filters) |

Marketplace results are **merged into the existing ranked results list** (same dedupe → enrich → rank flow), not shown in a separate tab. Listings carry extra deal fields (asking price, revenue, profit, listing URL) that render when present.

### Decisions already made (do not relitigate)

1. **On-demand per search** — actors run live when the user searches, same as the existing Google Maps flow. No scheduled crawls, no listings warehouse in v1.
2. **All 8 platforms, in two phases** — Phase 1 ships the 4 confirmed actors + all shared infrastructure; Phase 2 verifies and adds the remaining 4.
3. **Merged results** — listings become `RawLead`s (with optional deal fields) and flow through the existing pipeline.
4. **Smart source selection** — a deterministic rules file decides which actors run for a given `SearchCriteria`; typically 2–4 marketplace actors per search, never all 8.
5. **Config-driven registry** — one generic marketplace scraper engine + one config object per platform. No per-platform module files.
6. **Gated data is out of scope** — no buyer logins, no connection requests. We take only what the actor returns from public pages (Acquire full metrics and SMERGERS contacts stay null).

---

## 2. Architecture

```
runSearchPipeline(jobId, criteria)
  ├─ generateSearchQueries(criteria)              (existing)
  ├─ selectMarketplaceSources(criteria)           (NEW — returns MarketplaceSource[])
  ├─ Promise.allSettled([
  │     scrapeGoogleMaps(...),                    (existing)
  │     scrapeWebSearch(...),                     (existing)
  │     scrapeBBB(...),                           (existing)
  │     ...selected.map(s => runMarketplaceActor(s, criteria))   (NEW)
  │  ])
  ├─ deduplicateLeads(rawLeads)                   (existing, small change — see §6)
  ├─ enrichLeads / rankLeads                      (existing, prompt tweak — see §7)
  └─ results to jobStore                          (existing)
```

### New files

```
lib/scraping/marketplace/
  index.ts          — runMarketplaceActor(source, criteria): Promise<RawLead[]>
  registry.ts       — MARKETPLACE_SOURCES: Record<MarketplaceSourceId, MarketplaceSource>
  selector.ts       — selectMarketplaceSources(criteria): MarketplaceSource[]
  mappers/
    acquire.ts, flippa.ts, bizbuysell.ts, empireflippers.ts   (Phase 1)
    bizquest.ts, smergers.ts, loopnet.ts, ibba.ts             (Phase 2)
```

---

## 3. Types (`lib/types.ts` changes)

```ts
export type MarketplaceSourceId =
  | 'acquire' | 'flippa' | 'bizbuysell' | 'empire_flippers'      // Phase 1
  | 'bizquest' | 'smergers' | 'loopnet' | 'ibba';                // Phase 2

// Extend RawLead.source union:
source: 'google_maps' | 'web_search' | 'bbb' | 'directory' | MarketplaceSourceId;

// Add to RawLead (all optional so existing scrapers are untouched):
deal?: {
  askingPrice: number | null;        // USD; convert if actor returns other currency
  annualRevenue: number | null;      // USD/yr
  annualProfit: number | null;       // USD/yr (SDE or net — record which in rawData)
  multiple: number | null;           // price/profit if both known, else null
  listingUrl: string;                // canonical URL on the marketplace (required)
  listingTitle: string | null;
  brokerName: string | null;
  brokerContact: string | null;      // phone or email if public; often null (gated)
  listedAt: string | null;           // ISO date if the actor provides it
};
```

`EnrichedLead`/`RankedLead` inherit `deal` automatically via extension. Do **not** add deal fields to `businessDetails`.

---

## 4. The registry (`registry.ts`)

Each platform is one config object. This is the only thing Phase 2 adds per platform.

```ts
export interface MarketplaceSource {
  id: MarketplaceSourceId;
  label: string;                       // "BizBuySell"
  actorSlug: string;                   // e.g. 'parseforge/flippa-scraper'
  fallbackSlugs?: string[];            // alternates from research doc, tried on 404/deprecation
  buildInput(criteria: SearchCriteria, queries: string[]): Record<string, unknown>;
  mapItems(items: Record<string, unknown>[], criteria: SearchCriteria): RawLead[];
  maxResults: number;                  // hard cap per run (default env MARKETPLACE_MAX_RESULTS, 25)
  timeoutSecs: number;                 // default env MARKETPLACE_TIMEOUT_SECS, 120
  phase: 1 | 2;
  enabled: boolean;                    // kill switch per source without deploy (read env override, §9)
}
```

**`buildInput` rules:**
- Derive keywords from `criteria.industry.keywords` + `primary`; location from `criteria.location` where the platform supports it (BizBuySell/BizQuest/LoopNet are location-aware; Flippa/Acquire/Empire Flippers are mostly category/keyword-driven).
- Map `criteria.businessSize.revenueMin/Max` to the platform's price/revenue filters where the actor input supports it.
- **Every actor's real input schema must be verified before writing `buildInput`** — fetch it with `GET https://api.apify.com/v2/acts/{actorSlug}` (the `.defaultRunInput` / input schema) or via the Apify console. Do not guess field names from this spec.

**`mapItems` rules (per-platform mapper in `mappers/`):**
- `businessName` ← listing title (or business name if the actor separates them).
- `city/state` ← parsed from listing location when present; null otherwise (many digital listings have no location — that is fine).
- `website` ← the underlying business site **only if the actor exposes it**; never set it to the marketplace URL. The marketplace URL goes in `deal.listingUrl` and `sourceUrl`.
- Parse money strings (`"$1.2M"`, `"₹3.5 Cr"`, `"AU$40k"`) into USD numbers; keep the original in `rawData`. Use a shared `parseMoney(value, defaultCurrency)` util in `lib/utils/` with unit tests. SMERGERS amounts default INR; Flippa can be multi-currency. Use a fixed conversion table in code (comment the rates + date); precision is not critical for ranking.
- Skip items with no title AND no listing URL. Never throw on a single bad item — skip and `console.warn` with source + index.

**Alternative actors (fallbackSlugs), from the research table + store verification (2026-07-04):**
- acquire: `jungle_synthesizer/acquire-scraper`, `igolaizola/acquire-scraper`, `crawlerbros/acquire-scraper`
- flippa: `epicscrapers/flippa-scraper`, `deltaspider/flippa-scraper`, `piotrv1001/flippa-advanced-scraper`
- bizbuysell: `memo23/apify-bizbuysell-cheerio`, `good_cheap/bizbuysell-scraper`, `shahidirfan/bizbuysell-scraper`, `lexis-solutions/bizubuysell` (note: primary `acquistion-automation/bizbuysell-scraper` is $45/mo rental + usage — most expensive of the eight; compare fallbacks before committing)
- bizquest: `memo23/bizquest-scraper`, `powerai/bizquest-search-scraper`
- loopnet: `memo23/apify-loopnet-search-cheerio`, `crawlerbros/loopnet-scraper`, `piotrv1001/loopnet-listings-scraper`

**Verified actor pricing snapshot (2026-07-04, re-check at build time):** acquire $0.10/listing · flippa pay-per-event (updated 2026-05-05, rated 5.0) · bizbuysell $45/mo + $0.50/run + $0.006/listing (614 users, the most battle-tested) · empire flippers $5/mo · bizquest pay-per-event · loopnet ~$0.005/property · ibba ~$0.001/record. ParseForge maintains three of the eight (flippa, bizquest, loopnet) — one developer relationship covers 3 sources.

---

## 5. Runner (`index.ts`) and selector (`selector.ts`)

### Runner

`runMarketplaceActor(source, criteria, queries)`:
1. Reuse the existing `ApifyClient` pattern (`googleMaps.ts` is the reference): `client.actor(source.actorSlug).call(source.buildInput(criteria, queries), { waitSecs: source.timeoutSecs })`.
2. Create the shared client once in this module; token from `APIFY_API_TOKEN` (already in env).
3. On actor-not-found (404) or actor-deprecated errors: try `fallbackSlugs` in order (same input — log loudly if input schema rejects, don't retry further).
4. Read `run.defaultDatasetId` items with `limit: source.maxResults`.
5. Return `source.mapItems(items, criteria)`.
6. Log per source: run id, status, item count, duration — prefix `[Marketplace:{id}]`.

If `run.status !== 'SUCCEEDED'` after the wait (still `RUNNING` = timeout), **abort the run** via `client.run(run.id).abort()` so we stop paying for it, and return `[]` for timeout / throw for hard failure. `Promise.allSettled` in the pipeline already isolates failures.

### Selector — deterministic v1 rules

```ts
export function selectMarketplaceSources(criteria: SearchCriteria): MarketplaceSource[]
```

Applied to `enabled` sources of the current phase only:

| Source | Include when |
|--------|--------------|
| bizbuysell | `location.country` is US (or unset) |
| bizquest | same as bizbuysell |
| acquire | industry is digital (see predicate below) |
| flippa | industry is digital |
| empire_flippers | industry is digital |
| smergers | `location.country` is India OR not US |
| loopnet | industry keywords intersect REAL_ESTATE_TERMS (`real estate`, `property`, `storage`, `car wash`, `hotel`, `motel`, `rv park`, `laundromat`) |
| ibba | selected sources (before ibba) < 2 — broker discovery as a fallback source |

`isDigitalIndustry(criteria)`: `industry.primary` or any keyword/subSector matches DIGITAL_TERMS (`saas`, `software`, `app`, `ecommerce`, `e-commerce`, `online`, `content`, `newsletter`, `agency`, `marketplace`, `amazon fba`, `shopify`, `domain`).

Constraints: **cap at `MARKETPLACE_MAX_SOURCES` (default 4)** per search, priority order = table order above. If zero rules match, default to `[bizbuysell]` for US searches, `[smergers]` otherwise. Keyword lists are module constants — expect tuning; keep them exported for tests.

---

## 6. Pipeline & dedupe changes

**`searchPipeline.ts`:**
- Call `selectMarketplaceSources(criteria)`, add the runners into the existing `Promise.allSettled` array.
- Update the progress message to include selected marketplace names (e.g., “Searching Google Maps, web, BBB, BizBuySell, Flippa…”).
- Add selected marketplace labels to `sourcesUsed` **only when that source returned ≥1 lead** (match existing behavior).
- Keep the existing behavior where total failure of all sources throws with per-source reasons; include marketplace sources in that message.

**`deduplicator.ts`:** listings often have no phone/city and their `website` may be absent, so today they'd fall to the `unique::` random key (never merged — acceptable) — but two scrapers can return the **same listing** (BizBuySell ∩ BizQuest). Add one key ahead of the name-key: if `lead.deal?.listingUrl`, use `listing::${normalizedListingUrl}` (strip query string + trailing slash, lowercase host). Extend `mergeLeads` to keep `existing.deal ?? incoming.deal`.

---

## 7. Enrich, rank, UI

- **Enricher:** marketplace leads usually lack owner contact info; enrichment should not hallucinate it. If the enricher prompt receives leads, include `deal` context so descriptions are sensible. Skip web-contact enrichment for leads whose only URL is a marketplace listing.
- **Ranker:** pass `deal.askingPrice/annualRevenue/annualProfit` into the ranking prompt/features. A listing whose revenue fits `businessSize.revenueMin/Max` should rank above one that doesn't. `matchReason` should mention "listed for sale at $X" when applicable.
- **UI (results list):** when `lead.deal` exists render: a "For Sale" badge with the source label (e.g., `For Sale · BizBuySell`), asking price, revenue/profit when present, and make the row's primary link `deal.listingUrl`. No new tab/page. Keep it minimal — follow existing result-card styling.

---

## 8. Error handling summary

| Failure | Behavior |
|---------|----------|
| Actor run fails / times out | Abort run, log, contribute `[]`; search continues |
| Actor slug 404 / deprecated | Try `fallbackSlugs` in order; then treat as failed |
| Single bad item in dataset | Skip item, `console.warn`, continue mapping |
| All sources (incl. existing 3) return nothing | Existing throw with per-source reasons, now including marketplace sources |
| Apify token missing/invalid | Marketplace sources fail fast with a clear log line; existing sources unaffected |

---

## 9. Config / env

```
APIFY_API_TOKEN                    (exists)
MARKETPLACE_MAX_SOURCES=4          max actors per search
MARKETPLACE_MAX_RESULTS=25         per-source dataset item cap
MARKETPLACE_TIMEOUT_SECS=120       per-actor waitSecs
MARKETPLACE_DISABLED_SOURCES=      comma-separated ids, overrides registry.enabled (kill switch)
```

Cost note: worst case per search = 4 actors × ~25 items. At typical actor pricing this is cents-per-search, but monitor the Apify console during the first week and tune `MARKETPLACE_MAX_SOURCES` / selector rules if spend is high.

---

## 10. Phases & acceptance criteria

### Phase 1 — infrastructure + 4 confirmed actors

Scope: types, registry, runner, selector, mappers for **acquire, flippa, bizbuysell, empire_flippers**, dedupe key, pipeline wiring, ranker/enricher tweaks, UI deal fields, env config.

Before coding each mapper: run the actor once from the Apify console with a realistic input, save the output JSON into `tests/fixtures/marketplace/{id}.json`, and write the mapper against that fixture.

**Acceptance:**
1. Unit tests: each mapper maps its fixture to valid `RawLead[]` (money parsing, listingUrl present, no throws on partial items). `parseMoney` has its own tests.
2. Unit tests: selector rules — a "HVAC, Dallas TX" search selects bizbuysell (and ibba as fallback) but no digital actors; a "SaaS, no location" search selects acquire/flippa/empire_flippers; the `MARKETPLACE_MAX_SOURCES` cap is respected; Phase 2 sources are never selected while disabled.
3. E2E (manual, documented in PR): a US SMB search (e.g., "plumbing, Dallas TX") returns BizBuySell listings ranked in results with visible asking price and working listing links; a SaaS search returns Acquire/Flippa/Empire Flippers listings.
4. A search still completes when `MARKETPLACE_DISABLED_SOURCES` disables all marketplace sources, and when the Apify token is invalid.
5. Duplicate listing appearing from two sources dedupes to one row.

### Phase 2 — verify + add remaining 4

**Update 2026-07-04: store verification done.** BizQuest, LoopNet, and IBBA have verified live actors (see §1 table); SMERGERS has a likely actor from Lexis Solutions needing an exact-slug check. So step 1 shrinks to: run each actor once from the console with a realistic input to validate the output schema before writing its mapper.

For each of **bizquest, smergers, loopnet, ibba**:
1. Run the verified actor (§1 table) once with a realistic input; save the output as the test fixture. If a run fails or the actor turns out unmaintained, try the fallbacks (§4) — do **not** build a custom scraper under this spec (that's a separate task; note `apify/playwright-scraper`/Scrapy fallbacks exist per research but are out of scope).
2. Add registry entry + mapper + fixture + tests (same acceptance pattern as Phase 1).
3. LoopNet/Crexi: LoopNet actor first; Crexi only if trivially available via the same pattern — otherwise drop Crexi and note it.
4. IBBA returns **brokers**, not listings: map to `RawLead` with `source: 'ibba'`, broker firm as `businessName`, contact info into normal fields, `deal` only containing `listingUrl` (directory profile URL). Selector already restricts it to thin-result searches.

**Phase 2 acceptance:** same tests per source; plus an India-targeted search returns SMERGERS results and a real-estate-flavored search triggers LoopNet.

### Out of scope (both phases)
- Scheduled/background crawling, listings database, alerting on new listings
- Logged-in scraping of gated data (Acquire full metrics, SMERGERS contacts, BizBuySell broker gates)
- Custom scrapers for platforms without working actors
- A separate "For Sale" tab or listings-specific search UI

---

## 11. Reference

- Existing pattern to follow: `lib/scraping/googleMaps.ts` (Apify call), `lib/pipeline/searchPipeline.ts` (fan-out), `lib/utils/deduplicator.ts`.
- Apify API: actor object + input schema via `GET https://api.apify.com/v2/acts/{slug}`; runs via `apify-client` (`.actor(slug).call(input, { waitSecs })`); datasets via `client.dataset(id).listItems({ limit })`.
- Research source: Tier A table (33-source scraping research, Deal Sourcing Engine Linear project).
