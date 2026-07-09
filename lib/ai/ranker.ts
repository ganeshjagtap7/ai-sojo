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

export async function rankLeads(
  leads: EnrichedLead[],
  criteria: SearchCriteria
): Promise<RankedLead[]> {
  const { object } = await generateObject({
    model: getAIProvider(),
    schema: z.object({
      leads: z.array(z.object({
        index: z.number(),
        matchScore: z.number().min(0).max(100),
        matchReason: z.string(),
      })),
    }),
    prompt: `Rank these ${leads.length} businesses for a buyer looking for:
Industry: ${criteria.industry.primary} (${criteria.industry.subSectors.join(', ') || 'any sub-sector'})
Location: ${criteria.location.city}, ${criteria.location.state} (${criteria.location.radiusMiles}mi radius)
Size: ${formatSizePrefs(criteria.businessSize)}
Disqualifiers: ${criteria.preferences.disqualifiers.join(', ') || 'none'}

Businesses:
${JSON.stringify(rankerLeadRows(leads), null, 2)}`,
    system: rankerPrompt,
  });

  return leads
    .map((lead, i) => {
      const ranking = object.leads.find((r) => r.index === i);
      return {
        ...lead,
        matchScore: ranking?.matchScore ?? 0,
        matchReason: ranking?.matchReason ?? '',
        scrapedAt: new Date().toISOString(),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
