import { generateThesis } from '@/lib/ai/thesis';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/ratelimit';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(user.id);
  if (!allowed) {
    return Response.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const body = await req.json();
  const thesis = await generateThesis({
    archetype: body.archetype ?? null,
    facts: body.facts ?? {},
    buckets: body.buckets ?? {},
  });
  return Response.json(thesis);
}
