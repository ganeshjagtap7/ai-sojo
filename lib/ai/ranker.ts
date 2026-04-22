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

function formatSizePrefs(size: SearchCriteria['businessSize']): string {
  const parts: string[] = [];
  if (size.employeeMin || size.employeeMax)
    parts.push(`${size.employeeMin ?? 'any'}-${size.employeeMax ?? 'any'} employees`);
  if (size.revenueMin || size.revenueMax)
    parts.push(`$${size.revenueMin ?? 0}-$${size.revenueMax ?? '?'} revenue`);
  return parts.join(', ') || 'no size preference';
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
${JSON.stringify(leads.map((l, i) => ({
  index: i,
  name: l.businessName,
  city: l.city,
  industry: l.categories?.join(', '),
  employees: l.businessDetails?.employeeCount,
  revenue: l.businessDetails?.estimatedRevenue,
  rating: l.businessDetails?.googleRating,
  reviews: l.businessDetails?.reviewCount,
  bbbRating: l.businessDetails?.bbbRating,
  bbbAccredited: l.businessDetails?.bbbAccredited,
  yearsInBusiness: l.businessDetails?.yearsInBusiness,
  hasOwnerName: !!l.contact?.ownerName,
  hasEmail: !!l.contact?.email,
  hasPhone: !!l.contact?.phone,
})), null, 2)}`,
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
