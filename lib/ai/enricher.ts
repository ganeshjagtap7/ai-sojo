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

export async function enrichLeads(
  leads: RawLead[],
  criteria: SearchCriteria
): Promise<EnrichedLead[]> {
  const BATCH_SIZE = 15;
  const batches = chunkArray(leads, BATCH_SIZE);
  const results: EnrichedLead[] = [];

  for (const batch of batches) {
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

    for (const enrichment of object.leads) {
      const lead = batch[enrichment.index];
      results.push({
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
          linkedin: enrichment.linkedinSearchUrl, // explicit "search LinkedIn" URL, not a fabricated profile
          website: lead.website,
        },
        businessDetails: {
          yearsInBusiness: lead.yearsInBusiness,
          // Real scraped employee count only; estimatedRevenue is the AI band,
          // kept solely as a clearly-labeled fallback in the UI.
          employeeCount: lead.employeeCount,
          estimatedRevenue: enrichment.estimatedRevenue,
          googleRating: lead.googleRating,
          reviewCount: lead.reviewCount,
          bbbRating: lead.bbbRating,
          bbbAccredited: lead.bbbAccredited,
          operatingHours: null,
          categories: lead.categories,
        },
      });
    }
  }

  return results;
}
