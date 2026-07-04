import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// DB-only route — colocate with Supabase (Mumbai) for India-based users (#12).
export const preferredRegion = 'bom1';

const PostSchema = z.object({
  thesisId: z.string().uuid(),
  query: z.string().nullable(),
  leads: z.array(z.unknown()),
  metadata: z.unknown().nullable().optional(),
  status: z.enum(['running', 'complete', 'failed']).default('complete'),
});

export async function POST(req: Request) {
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

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  // Defense in depth: confirm the thesis belongs to this user. RLS would
  // already prevent the insert if it didn't, but this gives a clean 403.
  const { data: thesisOk } = await supabase
    .from('theses')
    .select('id')
    .eq('id', parsed.data.thesisId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!thesisOk) {
    return Response.json({ error: 'Thesis not found' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('searches')
    .insert({
      user_id: user.id,
      thesis_id: parsed.data.thesisId,
      query: parsed.data.query,
      leads: parsed.data.leads,
      search_metadata: parsed.data.metadata ?? null,
      status: parsed.data.status,
    })
    .select('id')
    .single();

  if (error || !data) {
    return Response.json(
      { error: `Failed to persist search: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, searchId: data.id }, { status: 201 });
}
