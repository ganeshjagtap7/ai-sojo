import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// DB-only route — colocate with Supabase (Mumbai) for India-based users (#12).
export const preferredRegion = 'bom1';

const PostSchema = z.object({
  thesisId: z.string().uuid(),
  // Client-generated per search attempt. A retry after a dropped response
  // reuses it so the insert dedupes instead of creating a duplicate row.
  // Optional for older clients — those simply don't get idempotency.
  idempotencyKey: z.string().uuid().optional(),
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

  const row = {
    user_id: user.id,
    thesis_id: parsed.data.thesisId,
    query: parsed.data.query,
    leads: parsed.data.leads,
    search_metadata: parsed.data.metadata ?? null,
    status: parsed.data.status,
    idempotency_key: parsed.data.idempotencyKey ?? null,
  };

  // Upsert with ON CONFLICT DO NOTHING on (user_id, idempotency_key): a retry
  // that reuses the key inserts nothing and returns no row (migration 0008).
  const { data, error } = await supabase
    .from('searches')
    .upsert(row, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: `Failed to persist search: ${error.message}` },
      { status: 500 },
    );
  }

  // A conflict (duplicate key) inserts nothing, so no row comes back — the row
  // the first request committed already exists; look it up and return its id so
  // the retry sees the same success instead of a duplicate.
  let searchId = data?.id;
  if (!searchId && parsed.data.idempotencyKey) {
    const { data: existing } = await supabase
      .from('searches')
      .select('id')
      .eq('user_id', user.id)
      .eq('idempotency_key', parsed.data.idempotencyKey)
      .maybeSingle();
    searchId = existing?.id;
  }

  if (!searchId) {
    return Response.json(
      { error: 'Failed to persist search: no row returned' },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, searchId }, { status: 201 });
}
