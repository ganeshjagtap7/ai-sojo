import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { readFileSync } from 'fs';
import { join } from 'path';

export const systemPrompt = readFileSync(
  join(process.cwd(), 'prompts/system.md'),
  'utf-8'
);

export const updateCriteriaTool = tool({
  description: 'Update search criteria based on what the user just said. Call this after EVERY user message.',
  inputSchema: zodSchema(z.object({
    criteriaComplete: z.boolean().describe('True when at least city AND industry are filled'),
    criteria: z.object({
      location: z.object({
        city: z.string().nullable(),
        state: z.string().nullable(),
        country: z.string().default('US'),
        radiusMiles: z.number().default(50),
      }),
      industry: z.object({
        primary: z.string().nullable(),
        subSectors: z.array(z.string()).default([]),
        keywords: z.array(z.string()).default([]),
      }),
      businessSize: z.object({
        revenueMin: z.number().nullable().default(null),
        revenueMax: z.number().nullable().default(null),
        employeeMin: z.number().nullable().default(null),
        employeeMax: z.number().nullable().default(null),
      }),
      preferences: z.object({
        businessAgeYears: z.number().nullable().default(null),
        ownerOperated: z.boolean().nullable().default(null),
        disqualifiers: z.array(z.string()).default([]),
      }),
      searcherType: z.enum(['traditional', 'self_funded', 'aspiring', 'unknown']).default('unknown'),
    }),
  })),
  execute: async (params) => params,
});
