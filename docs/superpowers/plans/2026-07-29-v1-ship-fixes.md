# V1 Ship Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Sojo from "feature-complete" to "shippable v1" — fix the correctness bugs that lose or degrade leads, move the AI pipeline onto per-step Claude models, close the UX dead-ends, and harden the scrapers — so we can run the UAT checklist and hand over to analysts.

**Architecture:** No architectural changes. Every task is a targeted fix inside the existing pipeline (queries → routed scrape → dedup → enrich → rank → SSE stream) and workspace. Phase A fixes silent lead loss and dead-ends, Phase B upgrades AI quality (batched thesis-aware ranking + per-step model routing), Phase C closes UX gaps, Phase D hardens scraper ops.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vercel AI SDK (`ai` + `@ai-sdk/anthropic` / `@ai-sdk/openai`), Supabase (Postgres + RLS), Apify, node:test via `npm test` (`tsx --test tests/*.test.ts`).

---

## Before you start (read this, seriously)

1. **Work from origin/main.** The local checkout on some machines is ~100 commits behind. Start with:
   ```bash
   git fetch origin && git checkout main && git pull
   git checkout -b fix/v1-ship-fixes
   ```
2. **One commit per task**, using the exact commit messages given. Push the branch and open ONE PR at the end of each phase (or one PR for the whole branch — Ganesh's call — but never batch uncommitted work across tasks).
3. **Run the full gate before every commit:**
   ```bash
   npm test && npm run typecheck
   ```
   Both must pass. `npm run build` is required before the final push of each phase.
4. **Never touch** the gated scrapers (`microns`, `mergerdomo`) or enable any disabled source — compliance sign-off is Ganesh's, not ours.
5. Tests run with NO network and NO API keys — if a test you write needs `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, the test is wrong (test the pure helpers, not the model calls).

---

# PHASE A — Correctness (ship blockers)

### Task 1: Shared `chunkArray` util

The enricher has a private `chunkArray`; the ranker is about to need the same thing (Task 2). Extract it once.

**Files:**
- Create: `lib/utils/chunk.ts`
- Modify: `lib/ai/enricher.ts` (delete its local copy, lines 14–20)
- Test: `tests/chunk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/chunk.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkArray } from '../lib/utils/chunk';

test('splits into even chunks with a remainder tail', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('empty input produces no chunks', () => {
  assert.deepEqual(chunkArray([], 3), []);
});

test('chunk size larger than the array yields one chunk', () => {
  assert.deepEqual(chunkArray([1, 2], 10), [[1, 2]]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test tests/chunk.test.ts`
Expected: FAIL — `Cannot find module '../lib/utils/chunk'`

- [ ] **Step 3: Create the util**

```ts
// lib/utils/chunk.ts
/** Split `arr` into consecutive chunks of at most `size` items. */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

- [ ] **Step 4: Point the enricher at it**

In `lib/ai/enricher.ts`:
- Delete the local `function chunkArray<T>(...)` block (lines 14–20).
- Add to the imports at the top:

```ts
import { chunkArray } from '@/lib/utils/chunk';
```

- [ ] **Step 5: Run the gate**

Run: `npm test && npm run typecheck`
Expected: all tests pass (including the existing `tests/enricher.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/utils/chunk.ts lib/ai/enricher.ts tests/chunk.test.ts
git commit -m "refactor: extract shared chunkArray util"
```

---

### Task 2: Batch the ranker (stop silent lead drops)

**The bug:** `rankLeads` sends EVERY deduped lead (can be 200+) to the model in ONE `generateObject` call. When the output hits the token ceiling, the model omits leads; omitted leads get `matchScore: 0` and are then silently dropped by the pipeline's `MATCH_SCORE_THRESHOLD` filter. **The fix:** rank in batches of 25, in parallel. A failed batch falls back to the neutral score (leads still surface); an omitted lead within a successful batch keeps the current "model chose not to rank it" semantics.

**Files:**
- Modify: `lib/ai/ranker.ts`
- Test: `tests/ranker.test.ts` (additions — do not delete existing tests)

- [ ] **Step 1: Write the failing test**

Append to `tests/ranker.test.ts`:

```ts
import { RANK_BATCH_SIZE, buildRankerPrompt } from '../lib/ai/ranker';

test('rank batch size is small enough to avoid output truncation', () => {
  assert.ok(RANK_BATCH_SIZE <= 25, `RANK_BATCH_SIZE=${RANK_BATCH_SIZE} is too large`);
});

test('buildRankerPrompt embeds the batch rows and criteria', () => {
  const lead = {
    businessName: 'Acme Plumbing', city: 'Atlanta', categories: ['Plumbing'],
    address: null, state: 'GA', zip: null, phone: '404-555-0100', website: 'https://acme.example',
    googleRating: 4.8, reviewCount: 120, yearsInBusiness: 12, employeeCount: 8,
    bbbRating: null, bbbAccredited: null, source: 'google_maps' as const, sourceUrl: null,
    rawData: {},
    id: 'lead_x', contact: { ownerName: null, phone: '404-555-0100', email: null, linkedin: null, website: 'https://acme.example' },
    businessDetails: {
      yearsInBusiness: 12, employeeCount: 8, estimatedRevenue: '$1M-$3M', googleRating: 4.8,
      reviewCount: 120, bbbRating: null, bbbAccredited: null, operatingHours: null, categories: ['Plumbing'],
    },
  };
  const criteria = {
    location: { city: 'Atlanta', state: 'GA', country: 'United States', radiusMiles: 25 },
    industry: { primary: 'Plumbing', subSectors: [], keywords: [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'unknown' as const,
  };
  const prompt = buildRankerPrompt([lead], criteria);
  assert.match(prompt, /Rank these 1 businesses/);
  assert.match(prompt, /Acme Plumbing/);
  assert.match(prompt, /Plumbing/);
});
```

(Use the same `test`/`assert` imports the file already has at the top.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test tests/ranker.test.ts`
Expected: FAIL — `RANK_BATCH_SIZE`/`buildRankerPrompt` are not exported.

- [ ] **Step 3: Rewrite `rankLeads` with batching**

In `lib/ai/ranker.ts`:

Add to the imports:

```ts
import { chunkArray } from '@/lib/utils/chunk';
```

Add below `formatSizePrefs` (keep `formatSizePrefs`, `rankerLeadRows`, `RankingSchema`, `mergeRankings`, `FALLBACK_SCORE`, `FALLBACK_REASON` exactly as they are):

```ts
/**
 * Leads per ranking call. The old single mega-call serialized EVERY lead into
 * one prompt; past ~100 leads the model's output hit the token ceiling and
 * silently omitted leads, which then scored 0 and were dropped below the
 * pipeline threshold. Small batches keep each response far from the ceiling.
 */
export const RANK_BATCH_SIZE = 25;

/** Exported for tests — the exact per-batch user prompt. */
export function buildRankerPrompt(batch: EnrichedLead[], criteria: SearchCriteria): string {
  return `Rank these ${batch.length} businesses for a buyer looking for:
Industry: ${criteria.industry.primary} (${criteria.industry.subSectors.join(', ') || 'any sub-sector'})
Location: ${criteria.location.city}, ${criteria.location.state} (${criteria.location.radiusMiles}mi radius)
Size: ${formatSizePrefs(criteria.businessSize)}
Disqualifiers: ${criteria.preferences.disqualifiers.join(', ') || 'none'}

Businesses:
${JSON.stringify(rankerLeadRows(batch), null, 2)}`;
}

async function rankBatch(batch: EnrichedLead[], criteria: SearchCriteria): Promise<Ranking[]> {
  const { object } = await generateObject({
    model: getAIProvider(),
    schema: RankingSchema,
    prompt: buildRankerPrompt(batch, criteria),
    system: rankerPrompt,
  });
  return object.leads;
}
```

Replace the whole body of `rankLeads` with:

```ts
export async function rankLeads(
  leads: EnrichedLead[],
  criteria: SearchCriteria
): Promise<RankedLead[]> {
  // Batched + parallel. Each batch fails soft on its own: a model error in one
  // batch surfaces THAT batch un-ranked (neutral score) without touching the
  // others, and no batch is big enough to truncate.
  const batches = chunkArray(leads, RANK_BATCH_SIZE);
  const settled = await Promise.allSettled(batches.map((b) => rankBatch(b, criteria)));

  const merged: RankedLead[] = [];
  settled.forEach((res, i) => {
    const batch = batches[i];
    if (res.status === 'fulfilled') {
      if (res.value.length < batch.length) {
        console.warn(`[Ranker] batch ${i}: model scored ${res.value.length}/${batch.length} leads`);
      }
      merged.push(...mergeRankings(batch, res.value, { score: 0, reason: '' }));
    } else {
      console.error(`[Ranker] batch ${i} failed — surfacing un-ranked:`, res.reason);
      merged.push(...mergeRankings(batch, [], { score: FALLBACK_SCORE, reason: FALLBACK_REASON }));
    }
  });

  // mergeRankings sorts within each batch; re-sort globally.
  return merged.sort((a, b) => b.matchScore - a.matchScore);
}
```

Note: `mergeRankings` matches `Ranking.index` against positions **within the batch** it's given, and the model sees per-batch `index` values from `rankerLeadRows(batch)` — so indices always line up; there is no global-offset bookkeeping.

- [ ] **Step 4: Run the gate**

Run: `npm test && npm run typecheck`
Expected: PASS, including all pre-existing ranker tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/ranker.ts tests/ranker.test.ts
git commit -m "fix(ranker): batch ranking calls so large searches stop silently dropping leads"
```

---

### Task 3: Stop the enricher/ranker contact-field mismatch; make enrichment deal-aware

**The bugs:** (1) The enricher prompt asks the model for `estimatedEmployees`, `ownerName`, `emailGuess` — then `mergeBatch` deliberately discards all three (they're guesses). Wasted tokens on every batch. (2) The ranker rubric awards 0–15 for "owner name + email + phone", but because of (1), `hasOwnerName`/`hasEmail` are ALWAYS false — every lead is capped at the phone-only tier. (3) The enricher doesn't know for-sale listings exist: it estimates revenue even when the listing states real revenue/asking price.

**Files:**
- Modify: `lib/ai/enricher.ts`
- Modify: `prompts/enricher.md` (full rewrite)
- Modify: `lib/ai/ranker.ts` (`rankerLeadRows` only)
- Modify: `prompts/ranker.md` (one bullet)
- Test: `tests/enricher.test.ts`, `tests/ranker.test.ts` (updates)

- [ ] **Step 1: Shrink the enrichment schema**

In `lib/ai/enricher.ts`, replace `EnrichmentSchema` with:

```ts
// Only the fields that actually survive mergeBatch. The old schema also asked
// for estimatedEmployees / ownerName / emailGuess, which mergeBatch discarded
// on purpose (guesses presented as facts) — so we no longer pay the model to
// produce them.
const EnrichmentSchema = z.object({
  leads: z.array(
    z.object({
      index: z.number(),
      estimatedRevenue: z.string().nullable(),
      linkedinSearchUrl: z.string().nullable(),
    }),
  ),
});
```

- [ ] **Step 2: Make the prompt rows deal-aware**

In `lib/ai/enricher.ts`, inside `enrichLeads`, replace the `batch.map((l, i) => ({ ... }))` object with:

```ts
{
  index: i,
  name: l.businessName,
  address: l.address,
  phone: l.phone,
  website: l.website,
  rating: l.googleRating,
  reviews: l.reviewCount,
  categories: l.categories,
  employees: l.employeeCount,
  // Deal fields — when the source already states real money numbers, the
  // model must NOT estimate over them (see prompts/enricher.md).
  statedRevenue: l.annualRevenue ?? null,
  forSale: l.forSale ?? false,
  askingPrice: l.askingPrice ?? null,
}
```

- [ ] **Step 3: Rewrite `prompts/enricher.md`**

Replace the entire file content with:

```markdown
You are a business intelligence analyst. You receive businesses scraped from Google Maps, web directories, AND business-for-sale marketplaces (rows with `forSale: true` and real `statedRevenue`/`askingPrice` values).

For each business, provide:
1. **estimatedRevenue**: An annual revenue band based on employee count, industry, review volume, and location. Use ranges like "$500K-$1M", "$1M-$3M", "$3M-$5M", "$5M-$10M".
   - If the row already has a non-null `statedRevenue`, return null — the real number is shown directly and must never be overwritten by an estimate.
   - Return null whenever you truly can't estimate.
2. **linkedinSearchUrl**: A LinkedIn people-search URL to find the owner. Format: https://www.linkedin.com/search/results/people/?keywords={businessName}+{city} — include an owner/founder name in the keywords only if one is clearly inferable from the business name or website domain. null if the business name is too generic to search.

Be conservative. It's better to say null than to guess wrong.
Return the same array with the two fields added, preserving each row's `index`.
```

- [ ] **Step 4: Fix the ranker's starved rubric**

In `lib/ai/ranker.ts`, in `rankerLeadRows`, replace the last three lines of the returned object:

```ts
    hasOwnerName: !!l.contact?.ownerName,
    hasEmail: !!l.contact?.email,
    hasPhone: !!l.contact?.phone,
```

with:

```ts
    hasPhone: !!l.contact?.phone,
    hasWebsite: !!l.website,
```

In `prompts/ranker.md`, replace the line:

```
- **Contact completeness (0-15):** Has owner name + email + phone = 15, partial = 5-10
```

with:

```
- **Reachability (0-15):** Has both a phone number and a website = 15, one of the two = 8, neither = 3
```

- [ ] **Step 5: Update the tests**

Run: `npm test`
Expected: `tests/enricher.test.ts` and/or `tests/ranker.test.ts` fail wherever fixtures still build enrichment rows with `estimatedEmployees`/`ownerName`/`emailGuess`, or assert `hasOwnerName`/`hasEmail` in `rankerLeadRows` output.

Fix them mechanically:
- In `tests/enricher.test.ts`: delete `estimatedEmployees`, `ownerName`, `emailGuess` keys from every enrichment-row fixture (the rows keep `index`, `estimatedRevenue`, `linkedinSearchUrl`).
- In `tests/ranker.test.ts`: in `rankerLeadRows` expectations, remove `hasOwnerName`/`hasEmail`, add `hasWebsite` with the value `!!lead.website` for the fixture used.

Do NOT weaken any assertion that isn't about these fields.

- [ ] **Step 6: Run the gate**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/enricher.ts lib/ai/ranker.ts prompts/enricher.md prompts/ranker.md tests/enricher.test.ts tests/ranker.test.ts
git commit -m "fix(ai): align enricher output with what survives merge; deal-aware enrichment; unstarve ranker reachability score"
```

---

### Task 4: Pipeline-wide time budget (enrich/rank can no longer blow the 300s ceiling)

**The bug:** the 180s scrape budget protects only scraping. Enrichment (sequential batches) + ranking then run un-budgeted; on a big result set the request breaches Vercel's `maxDuration = 300` AFTER the SSE stream opened — the user sees a dead spinner. **The fix:** a whole-pipeline deadline; when it approaches, remaining enrichment batches are emitted un-enriched and remaining rank batches fall back to the neutral score. Degraded results always beat a hard timeout.

**Files:**
- Modify: `lib/pipeline/searchPipeline.ts`
- Modify: `lib/ai/enricher.ts`
- Modify: `lib/ai/ranker.ts`
- Test: `tests/enricher.test.ts`, `tests/ranker.test.ts` (additions)

- [ ] **Step 1: Write the failing tests**

Append to `tests/enricher.test.ts`:

```ts
import { enrichLeads } from '../lib/ai/enricher';

test('a passed deadline short-circuits enrichment to un-enriched leads (no model call)', async () => {
  const lead = {
    businessName: 'Acme Plumbing', address: null, city: 'Atlanta', state: 'GA', zip: null,
    phone: '404-555-0100', website: null, googleRating: null, reviewCount: null, categories: [],
    yearsInBusiness: null, employeeCount: null, bbbRating: null, bbbAccredited: null,
    source: 'google_maps' as const, sourceUrl: null, rawData: {},
  };
  const criteria = {
    location: { city: 'Atlanta', state: 'GA', country: 'United States', radiusMiles: 25 },
    industry: { primary: 'Plumbing', subSectors: [], keywords: [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'unknown' as const,
  };
  // Deadline in the past → must return without ever touching the model/network.
  const out = await enrichLeads([lead], criteria, Date.now() - 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].businessName, 'Acme Plumbing');
  assert.equal(out[0].businessDetails.estimatedRevenue, null);
});
```

Append to `tests/ranker.test.ts` (reuse the `lead`/`criteria` fixture shapes from the Task 2 test):

```ts
import { rankLeads, FALLBACK_SCORE } from '../lib/ai/ranker';

test('a passed deadline surfaces every lead with the neutral fallback score (no model call)', async () => {
  const out = await rankLeads([lead], criteria, Date.now() - 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].matchScore, FALLBACK_SCORE);
});
```

(Declare the `lead`/`criteria` fixtures at module scope in the test file if the Task 2 test declared them inside a test body.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx tsx --test tests/enricher.test.ts tests/ranker.test.ts`
Expected: FAIL — extra argument not accepted / `FALLBACK_SCORE` not exported.

- [ ] **Step 3: Deadline-aware enricher**

In `lib/ai/enricher.ts`, change the `enrichLeads` signature and loop:

```ts
export async function enrichLeads(
  leads: RawLead[],
  criteria: SearchCriteria,
  // Absolute epoch-ms deadline. Batches that would start after it are emitted
  // un-enriched — degraded enrichment always beats a Vercel hard timeout.
  deadlineMs: number = Number.POSITIVE_INFINITY,
): Promise<EnrichedLead[]> {
  const BATCH_SIZE = 15;
  const batches = chunkArray(leads, BATCH_SIZE);
  const results: EnrichedLead[] = [];

  for (let bi = 0; bi < batches.length; bi++) {
    if (Date.now() > deadlineMs) {
      console.warn(`[Enricher] pipeline budget reached — emitting ${batches.length - bi} remaining batches un-enriched`);
      for (let j = bi; j < batches.length; j++) results.push(...mergeBatch(batches[j], []));
      break;
    }
    const batch = batches[bi];
    // ... keep the existing try/catch generateObject block and
    //     results.push(...mergeBatch(batch, enrichments)) EXACTLY as they are ...
  }

  return results;
}
```

(The body inside the loop is unchanged — only the surrounding `for` header, the deadline guard, and the signature change.)

- [ ] **Step 4: Deadline-aware ranker**

In `lib/ai/ranker.ts`:
- Export the constant: change `const FALLBACK_SCORE = 50;` to `export const FALLBACK_SCORE = 50;`
- Change `rankLeads` to accept and enforce the deadline:

```ts
export async function rankLeads(
  leads: EnrichedLead[],
  criteria: SearchCriteria,
  deadlineMs: number = Number.POSITIVE_INFINITY,
): Promise<RankedLead[]> {
  const batches = chunkArray(leads, RANK_BATCH_SIZE);
  const settled = await Promise.allSettled(
    batches.map((b) =>
      Date.now() > deadlineMs
        ? Promise.reject(new Error('pipeline budget exceeded'))
        : rankBatch(b, criteria),
    ),
  );
  // ... the merged/forEach block from Task 2 stays EXACTLY as written ...
}
```

- [ ] **Step 5: Thread the budget through the pipeline**

In `lib/pipeline/searchPipeline.ts`, directly under `const startTime = Date.now();` add:

```ts
  // Whole-pipeline budget (scrape + enrich + rank), kept under the route's
  // maxDuration=300s so we always finish streaming a result instead of being
  // hard-killed by Vercel mid-response. Enrichment stops early enough to leave
  // the ranker room.
  const pipelineBudgetMs = parseInt(process.env.PIPELINE_BUDGET_MS || '270000', 10);
  const rankReserveMs = parseInt(process.env.RANK_RESERVE_MS || '45000', 10);
  const pipelineDeadline = startTime + pipelineBudgetMs;
```

Then change the two calls:

```ts
  const enrichedLeads = await enrichLeads(dedupedLeads, criteria, pipelineDeadline - rankReserveMs);

  onProgress({ phase: 'ranking' });
  const rankedLeads = await rankLeads(enrichedLeads, criteria, pipelineDeadline);
```

- [ ] **Step 6: Run the gate**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline/searchPipeline.ts lib/ai/enricher.ts lib/ai/ranker.ts tests/enricher.test.ts tests/ranker.test.ts
git commit -m "fix(pipeline): whole-pipeline time budget so enrich/rank can't breach Vercel's 300s ceiling"
```

---

### Task 5: Fix the cross-thesis history dead-end

**The bug:** `/app/history` lists searches from ALL theses and links each to `/app?search=<id>`, but the workspace only loads the ACTIVE thesis's searches. Clicking an old-thesis row renders a silent blank pane (`activeSearch` null + `screen: idle` + zero leads). **The fix:** (a) unknown `?search=` ids fall back to the most recent search instead of null; (b) history rows from other theses say so and link to the thesis switcher instead.

**Files:**
- Modify: `app/app/page.tsx:70-72`
- Modify: `app/app/history/page.tsx`

- [ ] **Step 1: Fall back instead of blanking**

In `app/app/page.tsx`, replace:

```ts
  const activeSearch = requestedSearchId
    ? allSearches.find((s) => s.id === requestedSearchId) ?? null
    : allSearches[0] ?? null;
```

with:

```ts
  // An unknown ?search= id (deep link to another thesis's search, stale URL)
  // must not blank the pane — fall back to the most recent search.
  const activeSearch =
    (requestedSearchId ? allSearches.find((s) => s.id === requestedSearchId) : undefined) ??
    allSearches[0] ??
    null;
```

- [ ] **Step 2: Label other-thesis rows in history**

In `app/app/history/page.tsx`, after the `const { data } = await supabase...returns<SearchRow[]>();` query, add:

```ts
  const { data: activeThesis } = await supabase
    .from('theses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle<{ id: string }>();
  const activeThesisId = activeThesis?.id ?? null;
```

Inside `rows.map((r) => {`, add as the first line:

```ts
            const otherThesis = activeThesisId !== null && r.thesis_id !== activeThesisId;
```

Change the `<Link>`'s `href` prop to:

```ts
                href={otherThesis ? '/app/theses' : `/app?search=${r.id}`}
```

Change the status/meta line from:

```tsx
                    <span style={{ color: statusColor }}>● {r.status}</span> · {fmtAgo(r.created_at)}
```

to:

```tsx
                    <span style={{ color: statusColor }}>● {r.status}</span> · {fmtAgo(r.created_at)}
                    {otherThesis ? ' · different thesis' : ''}
```

And change the trailing button label:

```tsx
                <span className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>{otherThesis ? 'Switch thesis' : 'Open'}</span>
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, log in with a user that has ≥2 theses (create one via `/app/theses` → "+ New thesis" if needed).
Expected: history rows from the non-active thesis show "different thesis" + "Switch thesis" and land on `/app/theses`; a stale `/app?search=bogus-id` URL shows the most recent search, never a blank pane.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add app/app/page.tsx app/app/history/page.tsx
git commit -m "fix(workspace): cross-thesis history links no longer dead-end on a blank pane"
```

---

### Task 6: Atomic thesis switching

**The bug:** `/api/app/theses` POST (and the switcher UI behind it) deactivates the current thesis and activates the target as TWO separate statements. If the second fails, the user has ZERO active theses → `/app` redirects them into the onboarding wizard. Migration `0004` fixed exactly this pattern for onboarding with a `set_active_thesis` RPC; switching needs its own.

**Files:**
- Create: `supabase/migrations/0005_activate_thesis.sql`
- Modify: `app/api/app/theses/route.ts:56-73`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_activate_thesis.sql
--
-- Atomic "switch my active thesis to this one". The /api/app/theses POST used
-- to run deactivate-then-activate as two statements; a failure in between left
-- the user with NO active thesis (workspace kicks them back into onboarding).
-- One plpgsql function = one implicit transaction. SECURITY INVOKER (the
-- default) keeps RLS and auth.uid() in force, same as set_active_thesis (0004).
create or replace function public.activate_thesis(p_thesis_id uuid)
returns void
language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.theses where id = p_thesis_id and user_id = v_user_id
  ) then
    raise exception 'thesis not found';
  end if;

  -- Deactivate first so the partial unique index (one is_active per user)
  -- can't conflict; both statements roll back together on any error.
  update public.theses
    set is_active = false
    where user_id = v_user_id and is_active and id <> p_thesis_id;

  update public.theses
    set is_active = true
    where id = p_thesis_id and user_id = v_user_id;
end;
$$;

grant execute on function public.activate_thesis(uuid) to authenticated;
```

- [ ] **Step 2: Apply it to the live database**

Paste the file's SQL into the Supabase SQL editor (project `vlrucsqljnvjraulmzph`) and run it — same procedure used for migrations 0001–0004. Confirm with:

```sql
select proname from pg_proc where proname = 'activate_thesis';
```

Expected: one row.

- [ ] **Step 3: Use the RPC in the route**

In `app/api/app/theses/route.ts`, replace everything from the comment `// Deactivate the current active thesis first...` through the final `return Response.json({ ok: true });` of the POST handler with:

```ts
  // Atomic switch — both the deactivate and the activate happen in one
  // transaction inside the RPC, so a failure can never leave the user with
  // zero active theses (migration 0005).
  const { error } = await supabase.rpc('activate_thesis', { p_thesis_id: thesisId });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
```

(Keep the existing ownership pre-check above it — it returns the clean 404.)

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, go to `/app/theses`, click "Make active" on a non-active thesis.
Expected: switch works; `/app` shows the newly-active thesis's searches.

- [ ] **Step 5: Gate + commit**

```bash
npm test && npm run typecheck
git add supabase/migrations/0005_activate_thesis.sql app/api/app/theses/route.ts
git commit -m "fix(theses): atomic thesis switch via activate_thesis RPC"
```

---

### Task 7: Rate-limit /api/refine

**The bug:** every other model-calling route (`search`, `chat`, `thesis`) is quota-gated; `/api/refine` calls `generateText` with only an auth check — an authed user can spam model calls without limit.

**Files:**
- Modify: `lib/ratelimit.ts:4,14-18`
- Modify: `app/api/refine/route.ts`

- [ ] **Step 1: Confirm the RPC accepts arbitrary keys**

Run: `grep -n "p_key" supabase/migrations/0002*.sql supabase/migrations/0003*.sql`
Expected: `p_key` is declared `text` (not an enum). If it IS an enum, stop and flag to Ganesh — a migration would be needed. (It is expected to be `text`; no DB change should be required.)

- [ ] **Step 2: Add the key and its default**

In `lib/ratelimit.ts`:

```ts
export type RateLimitKey = 'search' | 'chat' | 'thesis' | 'refine';
```

and in `DEFAULT_LIMITS`:

```ts
const DEFAULT_LIMITS: Record<RateLimitKey, number> = {
  search: 25,
  chat: 100,
  thesis: 25,
  // Refine is one cheap generateText per submit, but it was the only
  // model-calling route with NO cap. 50/day is far above real usage.
  refine: 50,
};
```

- [ ] **Step 3: Gate the route**

In `app/api/refine/route.ts`, add to the imports:

```ts
import { checkRateLimit } from '@/lib/ratelimit';
```

and directly after the `if (!user) { ... 401 ... }` block:

```ts
  const { allowed } = await checkRateLimit(user.id, 'refine');
  if (!allowed) {
    return Response.json({ error: 'Daily refine limit reached. Try again tomorrow.' }, { status: 429 });
  }
```

(No refund path — refine is cheap and the Workspace already surfaces `json.error` from non-OK responses.)

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add lib/ratelimit.ts app/api/refine/route.ts
git commit -m "fix(refine): quota-gate /api/refine like every other model-calling route"
```

---

### Task 8: Extend the scraping-policy allowlist to every live inline source

**The bug:** `assertPublicSource` is the compliance gate ("public, logged-out only"), but its allowlist covers only 9 sources. Eleven MORE inline fetch scrapers are enabled and routed in production without ever passing the gate. All eleven scrape public, logged-out pages — they must be on the allowlist and must call the gate.

**Scope guard:** do NOT add the self-owned Apify actor sources (`quietlight`, `websiteclosers`, `synergy`, `tobuz`, `trustpilot`, `investorsclub`, `indiabiz`, `exitbid`, `businessdeals`, `apppeak`) or the gated sources (`microns`, `mergerdomo`) — those need Ganesh's explicit sign-off and are a separate decision.

**Files:**
- Modify: `lib/scraping/scrapingPolicy.ts:27-36,57-67`
- Modify: `lib/scraping/businessesforsale.ts`, `businessex.ts`, `buybiz.ts`, `smedealz.ts`, `franchisegator.ts`, `sideprojectors.ts`, `trustmrr.ts`, `producthunt.ts`, `hvacinformed.ts`, `esaContractors.ts`, `serviceExperts.ts`
- Test: `tests/scrapingPolicy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/scrapingPolicy.test.ts`
Expected: FAIL naming `businessesforsale` (and others).

- [ ] **Step 3: Extend the allowlist**

In `lib/scraping/scrapingPolicy.ts`, extend the `ScrapingSource` union with the eleven ids:

```ts
export type ScrapingSource =
  | 'google_maps'
  | 'web_search'
  | 'bbb'
  | 'yellowpages'
  | 'manta'
  | 'bizbuysell'
  | 'flippa'
  | 'acquire'
  | 'empireflippers'
  | 'businessesforsale'
  | 'businessex'
  | 'buybiz'
  | 'smedealz'
  | 'franchisegator'
  | 'sideprojectors'
  | 'trustmrr'
  | 'producthunt'
  | 'hvacinformed'
  | 'esa'
  | 'serviceexperts';
```

and add to `PUBLIC_SOURCES` (each of these scrapes public list pages logged-out):

```ts
  businessesforsale: { source: 'businessesforsale', label: 'BusinessesForSale', loggedOut: true },
  businessex: { source: 'businessex', label: 'BusinessEx', loggedOut: true },
  buybiz: { source: 'buybiz', label: 'BuyBiz', loggedOut: true },
  smedealz: { source: 'smedealz', label: 'smeDealz', loggedOut: true },
  franchisegator: { source: 'franchisegator', label: 'FranchiseGator', loggedOut: true },
  sideprojectors: { source: 'sideprojectors', label: 'SideProjectors', loggedOut: true },
  trustmrr: { source: 'trustmrr', label: 'TrustMRR', loggedOut: true },
  producthunt: { source: 'producthunt', label: 'Product Hunt', loggedOut: true },
  hvacinformed: { source: 'hvacinformed', label: 'HVACinformed', loggedOut: true },
  esa: { source: 'esa', label: 'ESA Contractors', loggedOut: true },
  serviceexperts: { source: 'serviceexperts', label: 'Service Experts', loggedOut: true },
```

- [ ] **Step 4: Call the gate in each scraper**

For each of the eleven files, add the import and the assertion as the FIRST statement of the exported scrape function (mirroring `lib/scraping/googleMaps.ts:14`). Find each entry point with:

```bash
grep -n "^export async function" lib/scraping/businessesforsale.ts lib/scraping/businessex.ts lib/scraping/buybiz.ts lib/scraping/smedealz.ts lib/scraping/franchisegator.ts lib/scraping/sideprojectors.ts lib/scraping/trustmrr.ts lib/scraping/producthunt.ts lib/scraping/hvacinformed.ts lib/scraping/esaContractors.ts lib/scraping/serviceExperts.ts
```

In each file:

```ts
import { assertPublicSource } from '@/lib/scraping/scrapingPolicy';
```

and first line inside the exported function (use the file's own source id — `'esa'` for `esaContractors.ts`, `'serviceexperts'` for `serviceExperts.ts`):

```ts
  assertPublicSource('businessesforsale'); // ← this file's RawLead source literal
```

- [ ] **Step 5: Run the gate**

Run: `npm test && npm run typecheck`
Expected: PASS — including the existing per-scraper fixture tests (the assertion throws only for unlisted sources, and all eleven are now listed).

- [ ] **Step 6: Commit**

```bash
git add lib/scraping/scrapingPolicy.ts lib/scraping/*.ts tests/scrapingPolicy.test.ts
git commit -m "fix(policy): route all 11 live inline fetch scrapers through the public-source compliance gate"
```

---

# PHASE B — AI upgrades (Claude per-step model routing + thesis-aware ranking)

### Task 9: Per-step model routing in the provider

**Goal:** stop running every AI step on one env-wide model (prod default `gpt-4o`). High-volume mechanical steps (query generation, enrichment batches) can run a cheap fast model; quality-visible steps (ranking, thesis synthesis, chat, refine) run the main model. Rollout is env-only and safe: with no new envs set, behavior is byte-identical to today.

**Files:**
- Modify: `lib/ai/provider.ts` (full rewrite)
- Modify: `lib/ai/queryGenerator.ts:15`, `lib/ai/enricher.ts`, `lib/ai/ranker.ts`, `lib/ai/thesis.ts`, `app/api/chat/route.ts`, `app/api/refine/route.ts` (call sites)
- Test: `tests/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/provider.test.ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAIProvider } from '../lib/ai/provider';

beforeEach(() => {
  delete process.env.AI_MODEL;
  delete process.env.AI_MODEL_FAST;
});

test('fast steps use AI_MODEL_FAST when set', () => {
  process.env.AI_MODEL = 'claude-sonnet-5';
  process.env.AI_MODEL_FAST = 'claude-haiku-4-5';
  assert.equal(getAIProvider('enrich').modelId, 'claude-haiku-4-5');
  assert.equal(getAIProvider('query').modelId, 'claude-haiku-4-5');
});

test('quality steps and default calls use AI_MODEL', () => {
  process.env.AI_MODEL = 'claude-sonnet-5';
  process.env.AI_MODEL_FAST = 'claude-haiku-4-5';
  assert.equal(getAIProvider('rank').modelId, 'claude-sonnet-5');
  assert.equal(getAIProvider('thesis').modelId, 'claude-sonnet-5');
  assert.equal(getAIProvider().modelId, 'claude-sonnet-5');
});

test('fast steps fall back to AI_MODEL when AI_MODEL_FAST is unset', () => {
  process.env.AI_MODEL = 'claude-sonnet-5';
  assert.equal(getAIProvider('enrich').modelId, 'claude-sonnet-5');
});

test('unset envs keep the historical default', () => {
  assert.equal(getAIProvider('rank').modelId, 'gpt-4o');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/provider.test.ts`
Expected: FAIL — `getAIProvider` takes no argument.

- [ ] **Step 3: Rewrite the provider**

Replace `lib/ai/provider.ts` entirely with:

```ts
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * The pipeline steps that call a model. 'query' and 'enrich' are high-volume
 * and mechanical, so they may run on a cheaper model via AI_MODEL_FAST; the
 * quality-visible steps (rank, thesis, chat, refine) always use AI_MODEL.
 *
 * Env rollout (Vercel):
 *   AI_MODEL=claude-sonnet-5        ← main model, all quality steps
 *   AI_MODEL_FAST=claude-haiku-4-5  ← optional; query gen + enrichment batches
 *   ANTHROPIC_API_KEY=...           ← required for any claude* model
 * With none of these set, everything runs on gpt-4o exactly as before.
 */
export type AIStep = 'query' | 'enrich' | 'rank' | 'thesis' | 'chat' | 'refine';

const FAST_STEPS: ReadonlySet<AIStep> = new Set(['query', 'enrich']);

export function getAIProvider(step?: AIStep) {
  const base = process.env.AI_MODEL || 'gpt-4o';
  const fast = process.env.AI_MODEL_FAST || base;
  const model = step && FAST_STEPS.has(step) ? fast : base;

  if (model.startsWith('claude')) {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return anthropic(model);
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  return openai(model);
}
```

- [ ] **Step 4: Tag every call site**

Find them: `grep -rn "getAIProvider()" lib app`
Change each to pass its step:
- `lib/ai/queryGenerator.ts` → `getAIProvider('query')`
- `lib/ai/enricher.ts` → `getAIProvider('enrich')`
- `lib/ai/ranker.ts` (in `rankBatch`) → `getAIProvider('rank')`
- `lib/ai/thesis.ts` → `getAIProvider('thesis')`
- `app/api/chat/route.ts` → `getAIProvider('chat')`
- `app/api/refine/route.ts` → `getAIProvider('refine')`

- [ ] **Step 5: Run the gate**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/provider.ts lib/ai/queryGenerator.ts lib/ai/enricher.ts lib/ai/ranker.ts lib/ai/thesis.ts app/api/chat/route.ts app/api/refine/route.ts tests/provider.test.ts
git commit -m "feat(ai): per-step model routing (AI_MODEL + AI_MODEL_FAST)"
```

- [ ] **Step 7: Env rollout (Ganesh or dev-with-access, AFTER the PR merges)**

In Vercel project settings add:

| Var | Value |
|---|---|
| `AI_MODEL` | `claude-sonnet-5` |
| `AI_MODEL_FAST` | `claude-haiku-4-5` |
| `ANTHROPIC_API_KEY` | (from Anthropic console) |

Keep `OPENAI_API_KEY` set until a prod search is verified on Claude, then it can be removed. Verify by running one search and checking the Vercel function logs show no provider errors.

---

### Task 10: Thesis-aware ranking (matchReason that references the buyer's own thesis)

**Goal:** the ranker currently sees only derived criteria. The sharp signal — the buyer's own words about stickiness, disqualifiers, vision — is sitting in `body.buckets` and never reaches it. Feed it through so `matchReason` reads like "matches your operator-upgrade thesis; service contracts = the stickiness you asked for".

**Files:**
- Modify: `app/api/search/route.ts`
- Modify: `lib/pipeline/searchPipeline.ts`
- Modify: `lib/ai/ranker.ts` (`buildRankerPrompt`, `rankBatch`, `rankLeads`)
- Modify: `prompts/ranker.md` (one paragraph)
- Test: `tests/ranker.test.ts` (addition)

- [ ] **Step 1: Write the failing test**

Append to `tests/ranker.test.ts` (reuse the module-scope `lead`/`criteria` fixtures):

```ts
test('buildRankerPrompt includes thesis notes when provided and omits the section when empty', () => {
  const withNotes = buildRankerPrompt([lead], criteria, 'stickiness: multi-year service contracts\ndisqualifier: customer concentration >40%');
  assert.match(withNotes, /Buyer's thesis notes/);
  assert.match(withNotes, /service contracts/);

  const withoutNotes = buildRankerPrompt([lead], criteria);
  assert.doesNotMatch(withoutNotes, /Buyer's thesis notes/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/ranker.test.ts`
Expected: FAIL — third argument not accepted.

- [ ] **Step 3: Extend the ranker**

In `lib/ai/ranker.ts`:

`buildRankerPrompt` gains an optional param and a trailing section:

```ts
export function buildRankerPrompt(
  batch: EnrichedLead[],
  criteria: SearchCriteria,
  thesisNotes?: string,
): string {
  const notesSection = thesisNotes?.trim()
    ? `\n\nBuyer's thesis notes (their own words — use them to sharpen each matchReason, and score DOWN any lead that clearly hits one of their disqualifiers):\n${thesisNotes.trim()}`
    : '';
  return `Rank these ${batch.length} businesses for a buyer looking for:
Industry: ${criteria.industry.primary} (${criteria.industry.subSectors.join(', ') || 'any sub-sector'})
Location: ${criteria.location.city}, ${criteria.location.state} (${criteria.location.radiusMiles}mi radius)
Size: ${formatSizePrefs(criteria.businessSize)}
Disqualifiers: ${criteria.preferences.disqualifiers.join(', ') || 'none'}${notesSection}

Businesses:
${JSON.stringify(rankerLeadRows(batch), null, 2)}`;
}
```

`rankBatch` and `rankLeads` thread it through:

```ts
async function rankBatch(batch: EnrichedLead[], criteria: SearchCriteria, thesisNotes?: string): Promise<Ranking[]> {
  const { object } = await generateObject({
    model: getAIProvider('rank'),
    schema: RankingSchema,
    prompt: buildRankerPrompt(batch, criteria, thesisNotes),
    system: rankerPrompt,
  });
  return object.leads;
}
```

and in `rankLeads`, add the 4th parameter `thesisNotes?: string` (after `deadlineMs`) and pass it: `rankBatch(b, criteria, thesisNotes)`.

- [ ] **Step 4: Thread from the route through the pipeline**

In `lib/pipeline/searchPipeline.ts`, add a third parameter to `runSearchPipeline`:

```ts
export async function runSearchPipeline(
  criteria: SearchCriteria,
  onProgress: OnProgress = () => {},
  thesisNotes?: string,
): Promise<SearchResult> {
```

and pass it to the ranker:

```ts
  const rankedLeads = await rankLeads(enrichedLeads, criteria, pipelineDeadline, thesisNotes);
```

In `app/api/search/route.ts`, before the `const stream = new ReadableStream({` line, add:

```ts
  // The buyer's own thesis words (stickiness, disqualifier, vision...) — the
  // ranker uses them to write matchReasons in the buyer's language.
  const thesisNotes = body.buckets && typeof body.buckets === 'object'
    ? Object.entries(body.buckets as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string' && v && v !== '(skipped)')
        .map(([k, v]) => `${k}: ${v as string}`)
        .join('\n')
    : '';
```

and change the pipeline call to:

```ts
        const { leads, metadata } = await runSearchPipeline(criteria, (e) =>
          send({ type: 'progress', ...e }),
        thesisNotes);
```

- [ ] **Step 5: Teach the prompt**

Append to `prompts/ranker.md`:

```
When "Buyer's thesis notes" are provided, write each matchReason in the buyer's own language — connect the business to their stated stickiness/archetype where it genuinely applies, and call out explicitly when a lead trips one of their stated disqualifiers (score it down accordingly).
```

- [ ] **Step 6: Run the gate**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/search/route.ts lib/pipeline/searchPipeline.ts lib/ai/ranker.ts prompts/ranker.md tests/ranker.test.ts
git commit -m "feat(ranker): thesis-aware ranking — matchReason speaks the buyer's own thesis"
```

---

# PHASE C — UX polish

### Task 11: Stage 5 surfaces thesis-generation failure (with retry)

**The bug:** in `Stage5Generate.tsx`, a `/api/thesis` failure is swallowed — `.catch` just advances the fake progress to "ready", the user clicks through, and Stage 6 shows an empty "Nothing to deliver yet". The failure must be visible at the point of failure, with a retry.

**Files:**
- Modify: `app/_components/flow/Stage5Generate.tsx`

- [ ] **Step 1: Extract the fetch into a retryable function with failure state**

In `Stage5Generate.tsx`, add state and a timer ref next to the existing state hooks:

```tsx
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

Add the function (above the effects):

```tsx
  function generateThesis() {
    setFailed(false);
    setThesisProgress(0);
    timerRef.current = setInterval(() => {
      setThesisProgress((p) => Math.min(p + 1, 4));
    }, 3000);

    fetch('/api/thesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archetype, facts, buckets }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`thesis ${r.status}`);
        return r.json();
      })
      .then((thesis) => {
        if (timerRef.current) clearInterval(timerRef.current);
        setThesisProgress(5);
        dispatch({ type: 'SET_THESIS', thesis });
      })
      .catch(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setThesisProgress(0);
        setFailed(true);
      });
  }
```

Replace the existing kick-off effect (the one containing the `fetch('/api/thesis', ...)`) with:

```tsx
  // Kick off thesis on mount (auto mode only). Deal search has moved to Surface 3 (/app).
  useEffect(() => {
    if (kickedRef.current || progressMode !== 'auto') return;
    kickedRef.current = true;
    generateThesis();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Render the failure card**

In the JSX, directly above the `{ready && (` block, add:

```tsx
          {failed && (
            <div className="s5-ready-card">
              <div className="t">Thesis generation failed — usually a temporary model hiccup.</div>
              <button onClick={generateThesis}>Try again</button>
            </div>
          )}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev` with `AI_MODEL=definitely-not-a-model` in `.env.local` (forces the thesis call to fail), walk the wizard to Stage 5.
Expected: failure card with working "Try again" instead of a fake "Ready". Remove the env override afterwards.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add app/_components/flow/Stage5Generate.tsx
git commit -m "fix(wizard): Stage 5 surfaces thesis-generation failure with retry instead of faking success"
```

---

### Task 12: Remove the inert "One flag" prompt on Stage 5

**The bug:** the flag question renders with no input (the input was removed in commit `5567778`) — a visible prompt the user cannot answer.

**Files:**
- Modify: `app/_components/flow/Stage5Generate.tsx`

- [ ] **Step 1: Delete the dead block**

Remove the line:

```tsx
  const thesisFlag = state.thesis?.flag;
```

and the JSX block:

```tsx
          {thesisFlag && !ready && (
            <div className="s5-idle">
              <div className="lbl">One flag</div>
              <p className="q">{thesisFlag}</p>
            </div>
          )}
```

- [ ] **Step 2: Gate + commit**

```bash
npm test && npm run typecheck
git add app/_components/flow/Stage5Generate.tsx
git commit -m "chore(wizard): remove the inert Stage 5 flag prompt"
```

---

### Task 13: Surface search metadata in the workspace header

**The gap:** `search_metadata` (sources used, scraped→qualified counts, duration) is persisted on every search and never shown. Analysts trust numbers they can see.

**Files:**
- Modify: `app/app/page.tsx` (SearchRow + select)
- Modify: `app/app/_components/Workspace.tsx` (SearchSummary + header)

- [ ] **Step 1: Load it server-side**

In `app/app/page.tsx`:

Add to the imports:

```ts
import type { RankedLead, SearchMetadata } from '@/lib/types';
```

(replacing the existing `import type { RankedLead } ...` line), extend `SearchRow`:

```ts
interface SearchRow {
  id: string;
  query: string | null;
  leads: RankedLead[] | null;
  status: 'running' | 'complete' | 'failed';
  created_at: string;
  search_metadata: SearchMetadata | null;
}
```

and add `search_metadata` to the select:

```ts
    .select('id, query, leads, status, created_at, search_metadata')
```

- [ ] **Step 2: Type + render it in the Workspace**

In `app/app/_components/Workspace.tsx`:

Extend the import:

```ts
import type { RankedLead, SearchCriteria, SearchMetadata } from '@/lib/types';
```

Extend `SearchSummary`:

```ts
export interface SearchSummary {
  id: string;
  query: string | null;
  leads: RankedLead[] | null;
  status: 'running' | 'complete' | 'failed';
  created_at: string;
  search_metadata?: SearchMetadata | null;
}
```

In the `results-head-meta` div, inside the existing `{activeSearch && (<> ... </>)}` fragment, after `<span>ranked by match</span>`, add:

```tsx
                  {activeSearch.search_metadata && (
                    <>
                      <span className="sep">·</span>
                      <span>
                        {activeSearch.search_metadata.sourcesUsed.length} sources · {activeSearch.search_metadata.totalScraped} scraped → {activeSearch.search_metadata.afterFiltering} qualified · {activeSearch.search_metadata.searchDurationSeconds}s
                      </span>
                    </>
                  )}
```

(Rows persisted before metadata existed are `null` — the guard hides the segment.)

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, run a search.
Expected: header meta line reads like `3 searches · ranked by match · 7 sources · 214 scraped → 86 qualified · 94s`.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add app/app/page.tsx app/app/_components/Workspace.tsx
git commit -m "feat(workspace): surface per-search source/count/duration metadata in the results header"
```

---

### Task 14: Don't auto-burn the first search on a thin thesis

**The bug:** first workspace entry auto-kicks a search. When the thesis buckets are thin (no `opening`/`stickiness` captured — issue #11's residue), `bucketsToCriteria` falls back to a generic "Business services in Atlanta" search — burning a quota slot and 1–2 minutes on garbage. **The fix:** thin thesis → show an explicit start screen instead of auto-kicking. A full thesis still auto-kicks exactly as today.

**Files:**
- Modify: `app/app/_components/Workspace.tsx`

- [ ] **Step 1: Add the screen kind and guard**

In `Workspace.tsx`, extend `ScreenState`:

```ts
type ScreenState =
  | { kind: 'initial-loading' }
  | { kind: 'idle' }
  | { kind: 'running'; label: string; sub: string }
  | { kind: 'empty-thesis' }
  | { kind: 'thin-thesis' }
  | { kind: 'failed'; error: string };
```

Below the `thesisIsEmpty` const, add:

```ts
  // A thesis whose conversation buckets never captured an opening/stickiness
  // answer produces a generic default search ("Business services in Atlanta").
  // Don't silently burn a quota slot on it — ask first.
  const thesisIsThin = !thesis.buckets?.opening && !thesis.buckets?.stickiness;
```

In the auto-kick effect, after the `thesisIsEmpty` branch, add:

```ts
    if (thesisIsThin) {
      setScreen({ kind: 'thin-thesis' });
      return;
    }
```

- [ ] **Step 2: Render the start screen**

In the `results-body` div, after the `empty-thesis` block, add:

```tsx
          {screen.kind === 'thin-thesis' && (
            <div className="searching">
              <h2 className="searching-title">Ready when <em>you</em> are.</h2>
              <p className="searching-sub">
                Your thesis is missing some conversation detail, so this first search will be broad.
                Run it as-is, or type a precise mandate below (e.g. &quot;HVAC business in Atlanta under $5M&quot;).
              </p>
              <button className="btn-primary" type="button" onClick={() => runSearch({ query: null, criteriaOverride: null })}>
                Run the search
              </button>
            </div>
          )}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev` with a user whose thesis has empty `opening`+`stickiness` buckets (create one by skipping the Stage 3 conversation).
Expected: no auto-search; the start screen renders; the button and the refine dock both work.

- [ ] **Step 4: Gate + commit**

```bash
npm test && npm run typecheck
git add app/app/_components/Workspace.tsx
git commit -m "fix(workspace): thin theses get an explicit start screen instead of auto-burning a generic search"
```

---

### Task 15: Put Theses in the main nav

**The gap:** the finished multi-thesis switcher is only reachable through the avatar dropdown.

**Files:**
- Modify: `app/app/_components/AppHeader.tsx:53-55`

- [ ] **Step 1: Add the link**

In the `header-nav` nav, after the History link, add:

```tsx
        <Link href="/app/theses" className={isActive('/app/theses') ? 'active' : ''}>
          Theses
        </Link>
```

- [ ] **Step 2: Gate + commit**

```bash
npm test && npm run typecheck
git add app/app/_components/AppHeader.tsx
git commit -m "feat(nav): surface the thesis switcher in the main nav"
```

---

# PHASE D — Ops hardening

### Task 16: Fail loudly when an Apify run didn't succeed

**The bug:** the five inline apify-client scrapers (`googleMaps`, `webSearch`, `bbb`, `yellowpages`, `manta`) call `.call({ waitSecs })` then read the dataset without checking `run.status`. A `FAILED`/`ABORTED`/`TIMED-OUT` run returns partial-or-zero items that look identical to "no results". (A still-`RUNNING` run after `waitSecs` is fine — partial data is intentional there.)

**Files:**
- Create: `lib/scraping/apifyGuard.ts`
- Modify: `lib/scraping/googleMaps.ts`, `webSearch.ts`, `bbb.ts`, `yellowpages.ts`, `manta.ts`
- Test: `tests/apifyGuard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/apifyGuard.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRunUsable } from '../lib/scraping/apifyGuard';

test('terminal failure statuses throw', () => {
  for (const status of ['FAILED', 'ABORTED', 'TIMED-OUT']) {
    assert.throws(() => assertRunUsable({ id: 'run1', status }, 'Test'), new RegExp(status));
  }
});

test('SUCCEEDED and still-RUNNING runs pass (partial data is usable)', () => {
  assert.doesNotThrow(() => assertRunUsable({ id: 'run1', status: 'SUCCEEDED' }, 'Test'));
  assert.doesNotThrow(() => assertRunUsable({ id: 'run1', status: 'RUNNING' }, 'Test'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/apifyGuard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the guard**

```ts
// lib/scraping/apifyGuard.ts
const TERMINAL_FAILURES = new Set(['FAILED', 'ABORTED', 'TIMED-OUT']);

/**
 * Throw when an Apify run terminally failed. Reading the dataset of a FAILED/
 * ABORTED/TIMED-OUT run silently returns partial-or-zero items — which looks
 * exactly like "the source had no results". Throwing lets the pipeline's
 * allSettled treat it as a failed source (fail-soft, logged). A run still
 * RUNNING after waitSecs is deliberately allowed: its partial dataset is real
 * data and the run finishes server-side.
 */
export function assertRunUsable(run: { id: string; status: string }, label: string): void {
  if (TERMINAL_FAILURES.has(run.status)) {
    throw new Error(`[${label}] Apify run ${run.id} ended ${run.status} — treating source as failed`);
  }
}
```

- [ ] **Step 4: Call it in the five scrapers**

Find each call site: `grep -n "\.call(" lib/scraping/googleMaps.ts lib/scraping/webSearch.ts lib/scraping/bbb.ts lib/scraping/yellowpages.ts lib/scraping/manta.ts`

In each file, add the import:

```ts
import { assertRunUsable } from '@/lib/scraping/apifyGuard';
```

and directly after the `const run = await client.actor(...).call({...}, { waitSecs: ... });` statement (in `googleMaps.ts` that's right after the `console.log(\`[GoogleMaps] run id=...\`)` line), add — using the file's own label:

```ts
  assertRunUsable(run, 'GoogleMaps');
```

(`'WebSearch'`, `'BBB'`, `'YellowPages'`, `'Manta'` respectively.)

- [ ] **Step 5: Gate + commit**

```bash
npm test && npm run typecheck
git add lib/scraping/apifyGuard.ts lib/scraping/googleMaps.ts lib/scraping/webSearch.ts lib/scraping/bbb.ts lib/scraping/yellowpages.ts lib/scraping/manta.ts tests/apifyGuard.test.ts
git commit -m "fix(scrapers): treat terminally-failed Apify runs as failed sources instead of silent empties"
```

---

### Task 17: Hard timeout on every raw-fetch scraper request

**The bug:** the fetch-based scrapers call `fetch(url, { headers })` with no timeout — one hung upstream holds its scraper slot until the 180s scrape budget fires. **The fix:** a shared wrapper with a 15s default per request.

**Files:**
- Create: `lib/scraping/fetchWithTimeout.ts`
- Modify: every `lib/scraping/*.ts` that calls bare `fetch(`
- Test: `tests/fetchWithTimeout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/fetchWithTimeout.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchWithTimeout } from '../lib/scraping/fetchWithTimeout';

test('aborts a hung request at the deadline', async () => {
  // A local server that accepts the connection and never responds —
  // deterministic hang, no external network involved.
  const server = createServer(() => { /* never respond */ });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await assert.rejects(
      () => fetchWithTimeout(`http://127.0.0.1:${port}/never`, {}, 300),
      (err: unknown) => err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'),
    );
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/fetchWithTimeout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the wrapper**

```ts
// lib/scraping/fetchWithTimeout.ts
/**
 * fetch() with a hard per-request timeout. The raw-fetch scrapers had none, so
 * a single hung upstream held its scraper slot until the pipeline-wide scrape
 * budget fired. 15s is generous for a public list page.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = parseInt(process.env.SCRAPER_FETCH_TIMEOUT_MS || '15000', 10),
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
```

- [ ] **Step 4: Apply it everywhere**

Find every bare fetch in the scraping layer:

```bash
grep -rn "await fetch(" lib/scraping/
```

In each listed file: add `import { fetchWithTimeout } from '@/lib/scraping/fetchWithTimeout';` and replace `await fetch(` with `await fetchWithTimeout(` (keep every existing argument as-is — the wrapper's `init` param takes the same object). Skip any call that ALREADY passes a `signal` in its init object (none are expected).

- [ ] **Step 5: Gate + commit**

```bash
npm test && npm run typecheck
git add lib/scraping/
git add tests/fetchWithTimeout.test.ts
git commit -m "fix(scrapers): 15s hard timeout on every raw-fetch scraper request"
```

---

### Task 18: Bring the UAT checklist + analyst runbook onto main

**The gap:** `docs/UAT-CHECKLIST.md` and `docs/ANALYST-RUNBOOK.md` — the definition of "v1 delivered" — live only on the `plan/on-demand-scraper-wiring` branch.

**Files:**
- Create (by copy): `docs/UAT-CHECKLIST.md`, `docs/ANALYST-RUNBOOK.md`

- [ ] **Step 1: Copy them from the plan branch**

```bash
git fetch origin plan/on-demand-scraper-wiring
git checkout origin/plan/on-demand-scraper-wiring -- docs/UAT-CHECKLIST.md docs/ANALYST-RUNBOOK.md
```

- [ ] **Step 2: Commit**

```bash
git add docs/UAT-CHECKLIST.md docs/ANALYST-RUNBOOK.md
git commit -m "docs: bring the UAT checklist + analyst runbook onto main"
```

---

## Final verification (before marking the branch ready)

- [ ] `npm test && npm run typecheck && npm run build` — all green.
- [ ] One full prod-like search locally (`npm run dev`, real keys in `.env.local`): thesis → search → results with matchReasons → metadata line in header → save a lead.
- [ ] Confirm the new/changed env vars are documented for Vercel:

| Var | Required? | Purpose |
|---|---|---|
| `AI_MODEL` | set to `claude-sonnet-5` at rollout | main model, quality steps |
| `AI_MODEL_FAST` | optional (`claude-haiku-4-5`) | query gen + enrichment |
| `ANTHROPIC_API_KEY` | required for claude models | — |
| `PIPELINE_BUDGET_MS` | optional (default 270000) | whole-pipeline budget |
| `RANK_RESERVE_MS` | optional (default 45000) | rank headroom inside the budget |
| `RATE_LIMIT_REFINE` | optional (default 50) | /api/refine daily cap |
| `SCRAPER_FETCH_TIMEOUT_MS` | optional (default 15000) | per-request fetch timeout |

- [ ] Run the golden queries G1–G5 from `docs/UAT-CHECKLIST.md` §5 against the preview deploy and record routed sources + top-10 relevance.
- [ ] Then run the full UAT checklist §1–6 on production before analyst handover.

## Deliberately deferred (do NOT do these in this branch)

- **SSE keepalive/heartbeat** — no observed proxy buffering issue yet; revisit if long silent enrich phases drop streams in prod.
- **Aborting orphaned Apify runs on budget expiry** — cost optimization, needs care not to kill runs whose partials we still read.
- **Deterministic pre-score / LLM shortlist cap** — batching (Task 2) already fixes truncation; a cap changes the "return everything qualified" product decision.
- **Adding self-owned actor sources to the compliance allowlist** — needs Ganesh's explicit sign-off per source.
- **Rate-limiter fail-open policy** — intentional (never lock users out on our own misconfig); the loud logs are the alarm.
- **Feeding thesis buckets into query generation** — the ranker gets them (Task 10); query gen already receives criteria keywords. Revisit only if routed-source queries look generic in the UAT golden queries.
