import { generateThesis } from '@/lib/ai/thesis';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, refundRateLimit } from '@/lib/ratelimit';
import { toFriendlyError } from '@/lib/errors/friendly';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(user.id, 'thesis');
  if (!allowed) {
    return Response.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const body = await req.json();
  try {
    const thesis = await generateThesis({
      archetype: body.archetype ?? null,
      facts: body.facts ?? {},
      buckets: body.buckets ?? {},
    });
    return Response.json(thesis);
  } catch (err) {
    // Map to calm copy (consistent with /api/search) and refund the slot — a
    // model outage shouldn't cost the user one of their daily theses.
    const { userMessage, logDetail } = toFriendlyError(err);
    console.error('[/api/thesis]', logDetail);
    await refundRateLimit(user.id, 'thesis');
    return Response.json({ error: userMessage }, { status: 502 });
  }
}
