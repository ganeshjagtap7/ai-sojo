import { createClient } from '@/lib/supabase/server';

// DB-only route — colocate with Supabase (Mumbai) for India-based users (#12).
export const preferredRegion = 'bom1';

// GET → list the signed-in user's theses (newest first) for the switcher.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('theses')
    .select('id, headline, paragraph, is_active, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ theses: data ?? [] });
}

// POST → make one thesis active (deactivate the rest). Body: { thesisId }.
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
  const thesisId = (body as { thesisId?: string })?.thesisId;
  if (!thesisId) {
    return Response.json({ error: 'thesisId is required' }, { status: 400 });
  }

  // Confirm the thesis is the user's own (RLS also enforces this) for a clean 404.
  const { data: target } = await supabase
    .from('theses')
    .select('id')
    .eq('id', thesisId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!target) {
    return Response.json({ error: 'Thesis not found' }, { status: 404 });
  }

  // Remember the currently active thesis so a failed activation below can
  // restore it — otherwise the user is stranded with no active thesis.
  const { data: prevActive } = await supabase
    .from('theses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  // Deactivate the current active thesis first so the partial unique index
  // (one is_active=true per user) doesn't conflict, then activate the target.
  const { error: deactivateError } = await supabase
    .from('theses')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true);
  if (deactivateError) {
    return Response.json({ error: deactivateError.message }, { status: 500 });
  }

  const { error } = await supabase
    .from('theses')
    .update({ is_active: true })
    .eq('id', thesisId)
    .eq('user_id', user.id);

  if (error) {
    if (prevActive?.id && prevActive.id !== thesisId) {
      await supabase
        .from('theses')
        .update({ is_active: true })
        .eq('id', prevActive.id)
        .eq('user_id', user.id);
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
