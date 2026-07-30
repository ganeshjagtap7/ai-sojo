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

  // Atomic switch — both the deactivate and the activate happen in one
  // transaction inside the RPC, so a failure can never leave the user with
  // zero active theses (migration 0005).
  const { error } = await supabase.rpc('activate_thesis', { p_thesis_id: thesisId });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
