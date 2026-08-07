import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAIProvider, AI_CALL_TIMEOUT_MS } from './provider';
import { SearchCriteria } from '@/lib/types';

const queryGeneratorPrompt = readFileSync(
  join(process.cwd(), 'prompts/query-generator.md'),
  'utf-8'
);

// Deterministic queries built straight from the criteria. Used when the model
// call times out or fails — the search still runs with reasonable queries
// instead of the whole pipeline crashing on a stalled provider.
function fallbackQueries(criteria: SearchCriteria) {
  const industry = criteria.industry.primary || 'business';
  const loc = [criteria.location.city, criteria.location.state, criteria.location.country]
    .filter(Boolean)
    .join(' ')
    .trim();
  const base = `${industry} ${loc}`.trim();
  return {
    googleMaps: [base, `${industry} companies ${loc}`.trim(), `${industry} services ${loc}`.trim()],
    webSearch: [`${industry} businesses for sale ${loc}`.trim(), base, `best ${industry} ${loc}`.trim()],
    bbb: [base, `${industry} services ${loc}`.trim()],
    yellowpages: [base, `${industry} ${loc}`.trim()],
  };
}

export async function generateSearchQueries(criteria: SearchCriteria) {
  try {
    const { object } = await generateObject({
      model: getAIProvider('query'),
      // Bound the call so a stalled provider can't hang the whole search.
      abortSignal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
      schema: z.object({
        googleMaps: z.array(z.string()).min(3).max(5),
        webSearch: z.array(z.string()).min(3).max(5),
        bbb: z.array(z.string()).min(2).max(4),
        yellowpages: z.array(z.string()).min(2).max(4),
      }),
      prompt: `Generate search queries for:
Industry: ${criteria.industry.primary}
Sub-sectors: ${criteria.industry.subSectors.join(', ') || 'any'}
Location: ${[criteria.location.city, criteria.location.state, criteria.location.country].filter(Boolean).join(', ') || 'any'}
Size preference: ${criteria.businessSize.employeeMin || 'any'}-${criteria.businessSize.employeeMax || 'any'} employees
Keywords: ${criteria.industry.keywords.join(', ') || 'none'}`,
      system: queryGeneratorPrompt,
    });

    return object;
  } catch (err) {
    console.error('[queryGenerator] model call failed — using deterministic fallback queries:', err);
    return fallbackQueries(criteria);
  }
}
