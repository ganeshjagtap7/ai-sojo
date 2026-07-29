import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { getAIProvider } from './provider';
import { chunkArray } from '@/lib/utils/chunk';
import { RawLead, EnrichedLead, SearchCriteria } from '@/lib/types';

const enricherPrompt = readFileSync(
  join(process.cwd(), 'prompts/enricher.md'),
  'utf-8'
);

// What the model returns per lead. `index` is model-supplied and untrusted —
// see mergeBatch for why we never index the batch with it directly.
const EnrichmentSchema = z.object({
  leads: z.array(
    z.object({
      index: z.number(),
      estimatedRevenue: z.string().nullable(),
      estimatedEmployees: z.number().nullable(),
      ownerName: z.string().nullable(),
      emailGuess: z.string().nullable(),
      linkedinSearchUrl: z.string().nullable(),
    }),
  ),
});
type EnrichmentRow = z.infer<typeof EnrichmentSchema>['leads'][number];

/**
 * Merge a scraped batch with the model's enrichments — fail-soft.
 *
 * We iterate the BATCH (not the model's output array) and look up each lead's
 * enrichment by position. This guarantees:
 *  - every scraped lead is emitted exactly once (no silent lead loss);
 *  - a hallucinated/out-of-range `index` from the model finds no lead and is
 *    simply ignored — it can never produce `batch[badIndex] === undefined` and
 *    crash the whole search (the original bug);
 *  - a lead with no enrichment is emitted un-enriched (real scraped fields only).
 */
export function mergeBatch(batch: RawLead[], enrichments: EnrichmentRow[]): EnrichedLead[] {
  const byIndex = new Map<number, EnrichmentRow>();
  for (const e of enrichments) if (!byIndex.has(e.index)) byIndex.set(e.index, e);

  return batch.map((lead, i) => {
    const e = byIndex.get(i);
    return {
      // Preserve ALL of the source's real fields (deal fields + rawData), then
      // layer id/contact/businessDetails on top. Never drop real data.
      ...lead,
      id: `lead_${nanoid(8)}`,
      contact: {
        // ownerName/email are AI guesses — don't present as scraped (UI shows "—").
        ownerName: null,
        phone: lead.phone,
        email: null,
        linkedin: e?.linkedinSearchUrl ?? null,
        website: lead.website,
      },
      businessDetails: {
        yearsInBusiness: lead.yearsInBusiness,
        employeeCount: lead.employeeCount, // real scraped count only
        estimatedRevenue: e?.estimatedRevenue ?? null, // AI band, labeled in the UI
        googleRating: lead.googleRating,
        reviewCount: lead.reviewCount,
        bbbRating: lead.bbbRating,
        bbbAccredited: lead.bbbAccredited,
        operatingHours: null,
        categories: lead.categories,
      },
    };
  });
}

export async function enrichLeads(
  leads: RawLead[],
  criteria: SearchCriteria
): Promise<EnrichedLead[]> {
  const BATCH_SIZE = 15;
  const batches = chunkArray(leads, BATCH_SIZE);
  const results: EnrichedLead[] = [];

  for (const batch of batches) {
    // Per-batch isolation: a failed batch (malformed model JSON → schema error,
    // provider 429/timeout) must NOT discard the batches already enriched. On
    // failure we emit the batch's leads un-enriched so no scraped work is lost.
    let enrichments: EnrichmentRow[] = [];
    try {
      const { object } = await generateObject({
        model: getAIProvider(),
        schema: EnrichmentSchema,
        prompt: `Enrich these businesses (industry context: ${criteria.industry.primary} in ${criteria.location.city}, ${criteria.location.state}):

${JSON.stringify(batch.map((l, i) => ({
  index: i,
  name: l.businessName,
  address: l.address,
  phone: l.phone,
  website: l.website,
  rating: l.googleRating,
  reviews: l.reviewCount,
  categories: l.categories,
  employees: l.employeeCount,
})), null, 2)}`,
        system: enricherPrompt,
      });
      enrichments = object.leads;
    } catch (err) {
      console.error('[Enricher] batch failed — emitting un-enriched leads:', err);
    }

    // mergeBatch is bounds-safe: an out-of-range model index is ignored instead
    // of crashing the whole search (the original 500-loses-everything bug).
    results.push(...mergeBatch(batch, enrichments));
  }

  return results;
}
