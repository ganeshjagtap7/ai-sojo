import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { RankedLead } from '@/lib/types';
import { SavedView, type SavedRow } from '../_components/SavedView';

export const dynamic = 'force-dynamic';
// Serve near the Supabase DB (Mumbai) — these pages are pure DB reads, and the
// team is in India; iad1 would add two ocean round-trips per navigation (#12).
export const preferredRegion = 'bom1';

interface DbRow {
  id: string;
  lead: RankedLead;
  stage: string;
  saved_at: string;
}

export default async function SavedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/saved');

  const { data } = await supabase
    .from('saved_leads')
    .select('id, lead, stage, saved_at')
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false })
    .returns<DbRow[]>();

  const rows: SavedRow[] = (data ?? []).map((r) => ({
    id: r.id,
    lead: r.lead,
    stage: r.stage,
    savedAt: r.saved_at,
  }));

  return <SavedView rows={rows} />;
}
