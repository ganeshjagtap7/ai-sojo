import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// DB-only route — colocate with Supabase (Mumbai) for India-based users (#12).
export const preferredRegion = 'bom1';

const STAGES = ['New', 'Outreach', 'Discovery', 'LOI sent', 'Passed'] as const;
const StageSchema = z.enum(STAGES);

const PostSchema = z.object({
  lead: z.object({ id: z.string() }).passthrough(),
  searchId: z.string().uuid().nullable().optional(),
});

const PatchSchema = z.object({
  leadId: z.string(),
  stage: StageSchema,
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const lead = parsed.data.lead as { id: string } & Record<string, unknown>;

  // De-dupe by (user_id, lead.id). Avoid inserting if one already exists.
  const { data: existing } = await supabase
    .from('saved_leads')
    .select('id')
    .eq('user_id', user.id)
    .filter('lead->>id', 'eq', lead.id)
    .maybeSingle();
  if (existing) {
    return Response.json({ ok: true, deduped: true, id: existing.id });
  }

  const { data, error } = await supabase
    .from('saved_leads')
    .insert({
      user_id: user.id,
      search_id: parsed.data.searchId ?? null,
      lead,
      stage: 'New',
    })
    .select('id')
    .single();

  if (error || !data) {
    // A unique-violation means a concurrent request already saved this lead
    // (the check-then-insert race). Treat it as an idempotent success: fetch
    // the row the winner inserted and return it, rather than a 500.
    if (error?.code === '23505') {
      const { data: dup } = await supabase
        .from('saved_leads')
        .select('id')
        .eq('user_id', user.id)
        .filter('lead->>id', 'eq', lead.id)
        .maybeSingle();
      if (dup) return Response.json({ ok: true, deduped: true, id: dup.id });
    }
    // Any other failure: log the real error, return calm copy (consistent with
    // the PATCH/DELETE handlers) rather than leaking the raw DB message.
    console.error('[saved] save failed:', error);
    return Response.json({ error: 'Could not save this lead. Please try again.' }, { status: 500 });
  }
  return Response.json({ ok: true, id: data.id }, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await supabase
    .from('saved_leads')
    .update({ stage: parsed.data.stage })
    .eq('user_id', user.id)
    .filter('lead->>id', 'eq', parsed.data.leadId);

  if (error) {
    console.error('[saved] stage update failed:', error);
    return Response.json({ error: 'Could not update the saved lead.' }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const leadId = url.searchParams.get('leadId');
  if (!leadId) return Response.json({ error: 'Missing leadId' }, { status: 400 });

  const { error } = await supabase
    .from('saved_leads')
    .delete()
    .eq('user_id', user.id)
    .filter('lead->>id', 'eq', leadId);

  if (error) {
    console.error('[saved] delete failed:', error);
    return Response.json({ error: 'Could not remove the saved lead.' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
