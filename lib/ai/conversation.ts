import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { readFileSync } from 'fs';
import { join } from 'path';

export const systemPrompt = readFileSync(
  join(process.cwd(), 'prompts/system.md'),
  'utf-8'
);

const teachCellSchema = z.object({
  n: z.string(),
  name: z.string(),
  body: z.string(),
});

export const updateSessionTool = tool({
  description: 'Update the session state after every user message. Always call this.',
  inputSchema: zodSchema(z.object({
    mode: z.enum(['elicit', 'pushback', 'teach', 'confirm']),
    bucket: z
      .enum(['opening', 'stickiness', 'archetype', 'disqualifier', 'concentration-nuance', 'vision'])
      .nullable()
      .optional(),
    bucketValue: z.string().nullable().optional(),
    pushbackOf: z.string().nullable().optional(),
    teachCard: z
      .object({
        eye: z.string(),
        h: z.string(),
        cells: z.array(teachCellSchema),
      })
      .nullable()
      .optional(),
    sessionComplete: z.boolean().default(false),
  })),
  execute: async (params) => params,
});
