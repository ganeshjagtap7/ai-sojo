import { createClient } from '@/lib/supabase/server';

// Soft-deactivate the user's currently active thesis so a fresh onboarding run
// can write a new active row. Old searches stay linked to the deactivated row;
// they remain readable but won't surface as the workspace's active context.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('theses')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
