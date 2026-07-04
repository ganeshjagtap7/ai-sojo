# Scraper Cap Fixes — Re-enable the 7 Disabled Sources

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the 5 uncapped scrapers + 1 token-missing scraper so they can be removed from the production kill switch, one at a time.

**Context:** A live health check (2026-07-04) ran every enabled registry source against its real site. All scrapers WORK — but 5 sweep entire sites in the request path, which in production means minutes of scraping and thousands of leads flooding the AI enricher (token cost + timeout risk). They are currently disabled via the Vercel env var:

```
SCRAPER_DISABLED_SOURCES=trustmrr,sideprojectors,esa,franchisegator,businessex,producthunt,hvacinformed
```

**Health-check evidence (why each is disabled):**

| Source | Result | Problem |
|---|---|---|
| esa | 10,308 leads / 4s | full directory dump |
| sideprojectors | 7,454 leads / 86s | full-site sweep |
| trustmrr | 4,768 items | full-site sweep |
| franchisegator | 3,860 franchises | full-site sweep |
| businessex | 1,346 leads / 25s | full-site sweep |
| producthunt | ERROR | `PH_TOKEN` env var missing |
| hvacinformed | ERROR | `HV_COOKIE` anti-bot cookies missing/expired |

**The fix pattern (reference implementation):** `lib/scraping/businessesforsale.ts` — see how it (a) builds the site's own search URL from criteria via `buildSearchPath()`, (b) caps pages with `SCRAPER_MAX_PAGES` (default 3), (c) falls back to the generic feed if the criteria search matches nothing. Its health-check result: 4 relevant leads in 1s instead of a 16k sweep. Copy this shape.

**Per-task done-when (same for every scraper below):**
1. `npx tsc --noEmit` clean and `npm test` green
2. Its `scripts/test-<source>.ts` run with realistic criteria returns relevant results in **<30s and <200 leads**
3. Committed (one commit per scraper)
4. After the PR merges: delete the source name from `SCRAPER_DISABLED_SOURCES` in Vercel (no redeploy needed — read at runtime) and run one production search that routes it

---

### Task 1: `trustmrr.ts`

- [ ] Open the site in a browser; check whether it has category/tag filter URLs. If yes, map `criteria.industry` keywords to them in a `buildSearchPath(criteria)`.
- [ ] The scraper paginates an API/list (health check: 4,772 items). Add an item cap: stop fetching once `SCRAPER_MAX_PAGES * ~50` items are collected (match the site's page size; expose as the same env-var pattern as businessesforsale).
- [ ] Prefer listings flagged for-sale first (the scraper already tracks "1304 for sale" — cap should keep those before non-sale items).
- [ ] Verify: `npx tsx scripts/test-trustmrr.ts` with SaaS criteria → <200 items, <30s. Commit `feat: trustmrr scraper capped + criteria-aware`.

### Task 2: `sideprojectors.ts`

- [ ] The site has project-type filters (SaaS/app/domain etc.) — map from `criteria.industry` keywords.
- [ ] Cap paginated fetches at `SCRAPER_MAX_PAGES` (health check: 7,454 items / 86s today).
- [ ] Verify with `scripts/test-sideprojectors.ts` → <200 leads, <30s. Commit.

### Task 3: `esaContractors.ts`

- [ ] Health check returned 10,308 leads in 4s — it's one big directory response. There is no search; the fix is a **post-fetch cap + criteria filter**: keep only entries whose category/state matches `criteria` (state from `criteria.location.state`), then slice to `MAX_RESULTS_PER_SCRAPER` (default 50).
- [ ] Verify → <100 leads for a GA security search. Commit.

### Task 4: `franchisegator.ts`

- [ ] Site has industry categories AND state pages — map both from criteria (it's US-only; state from `criteria.location.state`).
- [ ] Cap pagination at `SCRAPER_MAX_PAGES` (health check: 3,860 items today).
- [ ] Verify with a "franchise, Florida" criteria → <200 leads, <30s. Commit.

### Task 5: `businessex.ts`

- [ ] Check the site for industry/location filter URLs (India platform); map criteria if present, else post-fetch filter by industry keyword match on title/category.
- [ ] Cap pagination at `SCRAPER_MAX_PAGES` (health check: 1,346 leads / 25s today).
- [ ] Verify with Pune retail criteria → <200 leads, <30s. Commit.

### Task 6: Product Hunt token

- [ ] Create a free API token: producthunt.com → API dashboard (developer settings).
- [ ] Add `PH_TOKEN` to Vercel (Production + Preview) and `.env.local`.
- [ ] Verify `npx tsx scripts/test-producthunt.ts` returns results. No code change expected.
- [ ] Note: PDF reference classifies Product Hunt as a *signal* source, not a marketplace — low priority; do this last.

### Task 7: HVACinformed — park it (decision recorded)

- [ ] Do NOT chase the `HV_COOKIE` fix — the cookies are Incapsula anti-bot values that expire; keeping them alive is manual toil, and circumventing anti-bot conflicts with `scrapingPolicy.ts`.
- [ ] Leave `hvacinformed` in `SCRAPER_DISABLED_SOURCES` and add a comment in the registry entry: `// parked: anti-bot cookies; revisit as Apify actor (plan Phase 4)`.

---

**Out of scope:** the 12 Playwright scrapers (Phase 4 of the wiring plan — Apify actors), Tier A marketplaces (GAN-78), gated sources (compliance sign-off pending).
