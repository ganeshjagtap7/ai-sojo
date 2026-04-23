import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const service = createServiceClient();

  const { data, error } = await service
    .from('sessions')
    .insert({
      user_id: user.id,
      stage: 7,
      archetype: body.archetype ?? null,
      facts: body.facts ?? null,
      buckets: body.buckets ?? null,
      criteria: body.criteria ?? null,
      thesis: body.thesis ? JSON.stringify(body.thesis) : null,
      results: body.leads ?? null,
      metadata: body.metadata ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    return Response.json(
      { error: `Failed to save session: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return Response.json({ sessionId: data.id }, { status: 201 });
}
