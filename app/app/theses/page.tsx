import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ThesisManager, type ThesisRow } from './ThesisManager';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'bom1';

export default async function ThesesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/theses');

  const { data } = await supabase
    .from('theses')
    .select('id, headline, paragraph, is_active, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="view active">
      <div className="results-head">
        <div className="results-head-left">
          <div className="results-head-title">
            Your <em>theses</em>
          </div>
          <div className="results-head-meta">Switch the active thesis or start a new one</div>
        </div>
      </div>
      <ThesisManager initial={(data ?? []) as ThesisRow[]} />
    </div>
  );
}
