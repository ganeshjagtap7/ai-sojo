import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { getAIProvider } from './provider';
import { RawLead, EnrichedLead, SearchCriteria } from '@/lib/types';

const enricherPrompt = readFileSync(
  join(process.cwd(), 'prompts/enricher.md'),
  'utf-8'
);

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function toEnrichedLead(
  lead: RawLead,
  enrichment: { estimatedRevenue: string | null; linkedinSearchUrl: string | null } | null,
): EnrichedLead {
  return {
    // Preserve ALL of the source's real fields — deal fields (askingPrice,
    // annualRevenue, annualProfit, mrr, multiples, forSale…) and rawData —
    // then layer id/contact/businessDetails on top. Never drop real data.
    ...lead,
    id: `lead_${nanoid(8)}`,
    contact: {
      // Only surface REAL contact data. ownerName/email are AI guesses, so
      // we don't present them as scraped — leave null (the UI shows "—").
      ownerName: null,
      phone: lead.phone,
      email: null,
      linkedin: enrichment?.linkedinSearchUrl ?? null, // explicit "search LinkedIn" URL, not a fabricated profile
      website: lead.website,
    },
    businessDetails: {
      yearsInBusiness: lead.yearsInBusiness,
      // Real scraped employee count only; estimatedRevenue is the AI band,
      // kept solely as a clearly-labeled fallback in the UI.
      employeeCount: lead.employeeCount,
      estimatedRevenue: enrichment?.estimatedRevenue ?? null,
      googleRating: lead.googleRating,
      reviewCount: lead.reviewCount,
      bbbRating: lead.bbbRating,
      bbbAccredited: lead.bbbAccredited,
      operatingHours: null,
      categories: lead.categories,
    },
  };
}

async function enrichBatch(batch: RawLead[], criteria: SearchCriteria): Promise<EnrichedLead[]> {
  const { object } = await generateObject({
    model: getAIProvider(),
    schema: z.object({
      leads: z.array(z.object({
        index: z.number(),
        estimatedRevenue: z.string().nullable(),
        estimatedEmployees: z.number().nullable(),
        ownerName: z.string().nullable(),
        emailGuess: z.string().nullable(),
        linkedinSearchUrl: z.string().nullable(),
      })),
    }),
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

  // The index comes back from the model, so treat it as hostile: an
  // out-of-range value would crash the whole pipeline at its final stage, and
  // a duplicated one would duplicate a lead. Leads the model skips still flow
  // through un-enriched rather than silently disappearing.
  const byIndex = new Map<number, (typeof object.leads)[number]>();
  for (const enrichment of object.leads) {
    if (enrichment.index >= 0 && enrichment.index < batch.length && !byIndex.has(enrichment.index)) {
      byIndex.set(enrichment.index, enrichment);
    }
  }
  return batch.map((lead, i) => toEnrichedLead(lead, byIndex.get(i) ?? null));
}

export async function enrichLeads(
  leads: RawLead[],
  criteria: SearchCriteria
): Promise<EnrichedLead[]> {
  const BATCH_SIZE = 15;
  // Batches are independent; running them strictly one-at-a-time made
  // enrichment the slowest phase of the pipeline. A small concurrency keeps
  // us well under provider rate limits while cutting wall-clock ~3x.
  const CONCURRENCY = 3;
  const batches = chunkArray(leads, BATCH_SIZE);
  const results: EnrichedLead[] = [];

  for (const group of chunkArray(batches, CONCURRENCY)) {
    const settled = await Promise.all(group.map((batch) => enrichBatch(batch, criteria)));
    results.push(...settled.flat());
  }

  return results;
}
