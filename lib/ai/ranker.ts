import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAIProvider } from './provider';
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
    hasOwnerName: !!l.contact?.ownerName,
    hasEmail: !!l.contact?.email,
    hasPhone: !!l.contact?.phone,
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
const FALLBACK_SCORE = 50;
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

export async function rankLeads(
  leads: EnrichedLead[],
  criteria: SearchCriteria
): Promise<RankedLead[]> {
  // A ranker failure (malformed model JSON → schema error, provider 429/timeout)
  // must not kill a search that already scraped + enriched leads. On failure we
  // surface every lead un-ranked instead of throwing.
  let rankings: Ranking[] = [];
  let failed = false;
  try {
    const { object } = await generateObject({
      model: getAIProvider(),
      schema: RankingSchema,
      prompt: `Rank these ${leads.length} businesses for a buyer looking for:
Industry: ${criteria.industry.primary} (${criteria.industry.subSectors.join(', ') || 'any sub-sector'})
Location: ${criteria.location.city}, ${criteria.location.state} (${criteria.location.radiusMiles}mi radius)
Size: ${formatSizePrefs(criteria.businessSize)}
Disqualifiers: ${criteria.preferences.disqualifiers.join(', ') || 'none'}

Businesses:
${JSON.stringify(rankerLeadRows(leads), null, 2)}`,
      system: rankerPrompt,
    });
    rankings = object.leads;
  } catch (err) {
    console.error('[Ranker] ranking failed — surfacing leads un-ranked:', err);
    failed = true;
  }

  // Visibility: a normal response that scores fewer leads than we sent means the
  // model dropped some — log it so the divergence is never silent.
  if (!failed && rankings.length < leads.length) {
    console.warn(`[Ranker] model scored ${rankings.length}/${leads.length} leads; ${leads.length - rankings.length} fell back to ${0}`);
  }

  return mergeRankings(
    leads,
    rankings,
    failed ? { score: FALLBACK_SCORE, reason: FALLBACK_REASON } : { score: 0, reason: '' },
  );
}
