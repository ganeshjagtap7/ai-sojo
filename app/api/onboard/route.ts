import { createClient } from '@/lib/supabase/server';
import { thesisSaveStatus } from '@/lib/flow/thesisSave';
import { OnboardSchema } from '@/lib/flow/onboardSchema';

// DB-only route — colocate with Supabase (Mumbai) for India-based users (#12).
export const preferredRegion = 'bom1';

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

  const parsed = OnboardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const { archetype, facts, buckets, thesis } = parsed.data;

  // Save-eligibility is centralized in thesisSaveStatus (shared with the client).
  const status = thesisSaveStatus(facts, buckets, thesis);

  // No thesis means there was no localStorage state worth persisting. Treat
  // as a no-op so the interstitial can call this idempotently for returning
  // users without forcing a separate code path.
  if (status === 'no-thesis') {
    return Response.json({ ok: true, persisted: false }, { status: 200 });
  }

  // A thesis with NO captured answers is unusable downstream — searches would
  // run with no industry/location (issue #11). Refuse loudly rather than
  // persisting a row that silently breaks the workspace.
  if (status === 'empty-answers') {
    return Response.json(
      { error: 'Your thesis answers did not come through — please go back and redo the thesis conversation before saving.' },
      { status: 400 },
    );
  }

  // status === 'saveable' guarantees a thesis with a paragraph; this narrows the
  // type for TS (the check above already handled the null/no-paragraph cases).
  if (!thesis?.paragraph) {
    return Response.json({ ok: true, persisted: false }, { status: 200 });
  }

  // Update profile archetype if it came through. RLS lets the user touch
  // their own row only.
  if (archetype?.id) {
    await supabase
      .from('profiles')
      .update({ archetype: archetype.id })
      .eq('id', user.id);
  }

  // Deactivate-then-insert atomically via an RPC (see migration
  // 0004_set_active_thesis). Doing it as two separate statements here could
  // leave the user with NO active thesis if the insert failed after the
  // deactivate committed. The function runs in a single transaction.
  const { data, error } = await supabase.rpc('set_active_thesis', {
    p_headline: thesis.headline ?? null,
    p_paragraph: thesis.paragraph,
    p_sharpening: thesis.sharpening ?? null,
    p_disqualifiers: thesis.disqualifiers ?? [],
    p_buckets: buckets ?? {},
    p_facts: facts ?? {},
  });

  if (error || !data) {
    return Response.json(
      { error: `Failed to persist thesis: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // The RPC returns the new thesis id (uuid) directly.
  return Response.json({ ok: true, persisted: true, thesisId: data }, { status: 201 });
}
