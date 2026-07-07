import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { thesisSaveStatus } from '@/lib/flow/thesisSave';

// DB-only route — colocate with Supabase (Mumbai) for India-based users (#12).
export const preferredRegion = 'bom1';

// Mirrors the FlowState slice we care about persisting. We only accept fields
// the user actually generated — everything else gets dropped on the floor.
const OnboardSchema = z.object({
  archetype: z
    .object({ id: z.string().optional(), name: z.string().optional() })
    .nullable()
    .optional(),
  facts: z.record(z.string(), z.unknown()).optional(),
  buckets: z.record(z.string(), z.unknown()).optional(),
  thesis: z
    .object({
      headline: z.string().optional(),
      paragraph: z.string().optional(),
      sharpening: z.string().optional(),
      disqualifiers: z.array(z.string()).optional(),
      archetypeLabel: z.string().optional(),
      flag: z.string().nullable().optional(),
    })
    .optional(),
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

  // Soft-deactivate any existing active thesis so the partial unique index
  // (one is_active=true per user) doesn't blow up on insert.
  await supabase
    .from('theses')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('theses')
    .insert({
      user_id: user.id,
      headline: thesis.headline ?? null,
      paragraph: thesis.paragraph,
      sharpening: thesis.sharpening ?? null,
      disqualifiers: thesis.disqualifiers ?? [],
      buckets: buckets ?? {},
      facts: facts ?? {},
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    return Response.json(
      { error: `Failed to persist thesis: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, persisted: true, thesisId: data.id }, { status: 201 });
}
