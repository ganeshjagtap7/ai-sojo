import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WizardPage } from './_components/flow/WizardPage';

export const dynamic = 'force-dynamic';
// DB-only auth check; serve near Supabase (Mumbai) like the other app pages.
export const preferredRegion = 'bom1';

/**
 * The onboarding wizard is for NEW users (or an explicit thesis rebuild,
 * which deactivates the old thesis before landing here). A signed-in user
 * with an active thesis belongs in their workspace, not on the marketing
 * landing — bounce them.
 */
export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: active } = await supabase
      .from('theses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (active) redirect('/app');
  }
  return <WizardPage />;
}
