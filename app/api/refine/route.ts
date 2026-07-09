import { generateText } from 'ai';
import { z } from 'zod';
import { getAIProvider } from '@/lib/ai/provider';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const InputSchema = z.object({
  query: z.string().min(2).max(400),
  thesis: z
    .object({
      facts: z.record(z.string(), z.unknown()).optional(),
      buckets: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const SYSTEM_PROMPT = `You translate a searcher's natural-language refinement into a structured override on top of their thesis-derived search criteria. Output ONLY valid JSON, no prose, no markdown fences.

Schema:
{
  "industry": { "primary": string?, "keywords": string[]? }?,
  "location": { "city": string?, "state": string?, "country": string?, "radiusMiles": number? }?,
  "businessSize": { "revenueMin": number | null?, "revenueMax": number | null? }?,
  "summary": string  // human-readable label of the parsed override, e.g. "HVAC, Atlanta, ≤$5M rev"
}

Rules:
- Only include fields the user explicitly mentioned or strongly implied. Don't fill in things they didn't say.
- "under $5M rev" => revenueMax: 5_000_000. "over $2M" => revenueMin: 2_000_000. "$3-10M" => revenueMin: 3_000_000, revenueMax: 10_000_000.
- Locations can be anywhere in the world, not just the US.
  - "country": full country name when the user names or clearly implies one (e.g. "in India" => "India", "UK businesses" => "United Kingdom"). Omit if not stated.
  - "city": title case, when a city is given.
  - "state": for US locations, the 2-letter US code when recognizable; for other countries, the region/state/province name as written; null if none.
  - Examples: "manufacturing business in India" => industry {primary:"Manufacturing"}, location {country:"India"}. "SaaS in Bangalore" => location {city:"Bangalore", country:"India"}. "plumbing in Toronto, Canada" => location {city:"Toronto", country:"Canada"}. "HVAC in Austin, TX" => location {city:"Austin", state:"TX", country:"United States"}.
- "summary" is short and human (lowercase ok), not JSON-shaped.
- If the query has zero useful overrides, return: {"summary": "no extractable criteria"}.
`;

export async function POST(req: Request) {
  // Auth gate.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const { query, thesis } = parsed.data;

  const userMessage = JSON.stringify(
    {
      query,
      currentThesis: {
        facts: thesis?.facts ?? {},
        buckets: thesis?.buckets ?? {},
      },
    },
    null,
    2,
  );

  try {
    const { text } = await generateText({
      model: getAIProvider(),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json({ criteria: {}, summary: 'no extractable criteria' });
    }

    const obj = JSON.parse(match[0]) as Record<string, unknown>;

    // Normalize into the SearchCriteria-shaped override the search route expects.
    const criteria: Record<string, unknown> = {};
    if (obj.industry && typeof obj.industry === 'object') {
      criteria.industry = obj.industry;
    }
    if (obj.location && typeof obj.location === 'object') {
      criteria.location = obj.location;
    }
    if (obj.businessSize && typeof obj.businessSize === 'object') {
      criteria.businessSize = obj.businessSize;
    }

    const summary = typeof obj.summary === 'string' ? obj.summary : 'parsed';

    return Response.json({ criteria, summary });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Refine failed' },
      { status: 500 },
    );
  }
}
