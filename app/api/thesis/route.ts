import { generateThesis } from '@/lib/ai/thesis';

export async function POST(req: Request) {
  const body = await req.json();
  const thesis = await generateThesis({
    archetype: body.archetype ?? null,
    facts: body.facts ?? {},
    buckets: body.buckets ?? {},
  });
  return Response.json(thesis);
}
