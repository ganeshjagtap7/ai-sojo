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
        id: `lead_${nanoid(8)}`,
        businessName: lead.businessName,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        phone: lead.phone,
        website: lead.website,
        googleRating: lead.googleRating,
        reviewCount: lead.reviewCount,
        categories: lead.categories,
        yearsInBusiness: lead.yearsInBusiness,
        employeeCount: lead.employeeCount,
        bbbRating: lead.bbbRating,
        bbbAccredited: lead.bbbAccredited,
        source: lead.source,
        sourceUrl: lead.sourceUrl,
        contact: {
          ownerName: enrichment.ownerName,
          phone: lead.phone,
          email: enrichment.emailGuess,
          linkedin: enrichment.linkedinSearchUrl,
          website: lead.website,
        },
        businessDetails: {
          yearsInBusiness: lead.yearsInBusiness,
          employeeCount: enrichment.estimatedEmployees ?? lead.employeeCount,
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
