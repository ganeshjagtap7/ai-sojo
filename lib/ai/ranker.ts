import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAIProvider } from './provider';
import { chunkArray } from '@/lib/utils/chunk';
import { EnrichedLead, RankedLead, SearchCriteria } from '@/lib/types';

const rankerPrompt = readFileSync(
  join(process.cwd(), 'prompts/ranker.md'),
  'utf-8'
);

export function formatSizePrefs(size: SearchCriteria['businessSize']): string {
  const parts: string[] = [];
  if (size.employeeMin || size.employeeMax)
    parts.push(`${size.employeeMin ?? 'any'}-${size.employeeMax ?? 'any'} employees`);
  if (size.revenueMin || size.revenueMax)
    parts.push(`$${size.revenueMin ?? 0}-$${size.revenueMax ?? '?'} revenue`);
  if (size.priceMin || size.priceMax)
    parts.push(`$${size.priceMin ?? 0}-$${size.priceMax ?? '?'} asking price`);
  return parts.join(', ') || 'no size preference';
}

// The per-lead facts handed to the ranker. Extracted + exported so the deal
// fields it now surfaces can be unit-tested without invoking the model. Prefers
// the REAL scraped revenue over the AI estimate, and passes the deal fields so
// for-sale listings that fit the buyer's price/size can outrank plain directory
// businesses.
export function rankerLeadRows(leads: EnrichedLead[]) {
  return leads.map((l, i) => ({
    index: i,
    name: l.businessName,
    city: l.city,
    industry: l.categories?.join(', '),
    employees: l.businessDetails?.employeeCount,
    // Real stated revenue when the source has it; otherwise the AI estimate.
    revenue: l.annualRevenue ?? l.businessDetails?.estimatedRevenue ?? null,
    forSale: l.forSale ?? false,
    askingPrice: l.askingPrice ?? null,
    cashFlow: l.annualProfit ?? null,
    rating: l.businessDetails?.googleRating,
    reviews: l.businessDetails?.reviewCount,
    bbbRating: l.businessDetails?.bbbRating,
    bbbAccredited: l.businessDetails?.bbbAccredited,
    yearsInBusiness: l.businessDetails?.yearsInBusiness,
    hasPhone: !!l.contact?.phone,
    hasWebsite: !!l.website,
  }));
}

// What the model returns per lead. `index` is model-supplied and untrusted —
// mergeRankings looks leads up BY index rather than trusting the array shape.
const RankingSchema = z.object({
  leads: z.array(z.object({
    index: z.number(),
    matchScore: z.number().min(0).max(100),
    matchReason: z.string(),
  })),
});
type Ranking = z.infer<typeof RankingSchema>['leads'][number];

// Neutral fallback surfaced when the whole ranker call fails — better to show
// leads un-ranked (fail-soft, like the enricher) than to 500 the whole search
// or silently drop everything below the pipeline's score threshold.
export const FALLBACK_SCORE = 50;
const FALLBACK_REASON = 'Surfaced un-ranked — the ranker was unavailable for this search.';

/**
 * Merge enriched leads with the model's rankings — fail-soft, index-safe.
 *
 * We iterate the LEADS (not the model's array) and look each lead's ranking up
 * by position, so:
 *  - every lead is emitted exactly once (no silent lead loss);
 *  - a hallucinated / out-of-range model index simply finds no lead and is
 *    ignored (it can never crash or shift the mapping);
 *  - a lead the model omits gets `fallback` — 0 on a normal response (the model
 *    deliberately didn't rank it), or a neutral score when the whole call
 *    failed so results still surface.
 */
export function mergeRankings(
  leads: EnrichedLead[],
  rankings: Ranking[],
  fallback: { score: number; reason: string } = { score: 0, reason: '' },
  now: string = new Date().toISOString(),
): RankedLead[] {
  const byIndex = new Map<number, Ranking>();
  for (const r of rankings) if (!byIndex.has(r.index)) byIndex.set(r.index, r);

  return leads
    .map((lead, i) => {
      const ranking = byIndex.get(i);
      return {
        ...lead,
        matchScore: ranking?.matchScore ?? fallback.score,
        matchReason: ranking?.matchReason ?? fallback.reason,
        scrapedAt: now,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

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
    model: getAIProvider('rank'),
    schema: RankingSchema,
    prompt: buildRankerPrompt(batch, criteria),
    system: rankerPrompt,
  });
  return object.leads;
}

export async function rankLeads(
  leads: EnrichedLead[],
  criteria: SearchCriteria,
  deadlineMs: number = Number.POSITIVE_INFINITY,
): Promise<RankedLead[]> {
  // Batched + parallel. Each batch fails soft on its own: a model error in one
  // batch surfaces THAT batch un-ranked (neutral score) without touching the
  // others, and no batch is big enough to truncate. Past the deadline, batches
  // reject immediately so their leads surface un-ranked instead of breaching the
  // route's maxDuration.
  const batches = chunkArray(leads, RANK_BATCH_SIZE);
  const settled = await Promise.allSettled(
    batches.map((b) =>
      Date.now() > deadlineMs
        ? Promise.reject(new Error('pipeline budget exceeded'))
        : rankBatch(b, criteria),
    ),
  );

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
