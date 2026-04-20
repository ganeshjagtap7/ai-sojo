import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAIProvider } from './provider';
import { SearchCriteria } from '@/lib/types';

const queryGeneratorPrompt = readFileSync(
  join(process.cwd(), 'prompts/query-generator.md'),
  'utf-8'
);

export async function generateSearchQueries(criteria: SearchCriteria) {
  const { object } = await generateObject({
    model: getAIProvider(),
    schema: z.object({
      googleMaps: z.array(z.string()).min(3).max(5),
      webSearch: z.array(z.string()).min(3).max(5),
    }),
    prompt: `Generate search queries for:
Industry: ${criteria.industry.primary}
Sub-sectors: ${criteria.industry.subSectors.join(', ') || 'any'}
City: ${criteria.location.city}, ${criteria.location.state}
Size preference: ${criteria.businessSize.employeeMin || 'any'}-${criteria.businessSize.employeeMax || 'any'} employees
Keywords: ${criteria.industry.keywords.join(', ') || 'none'}`,
    system: queryGeneratorPrompt,
  });

  return object;
}
