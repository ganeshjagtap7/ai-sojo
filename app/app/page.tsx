import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Workspace } from './_components/Workspace';
import type { RankedLead } from '@/lib/types';
import type { Buckets, Facts } from '@/lib/flow/types';

export const dynamic = 'force-dynamic';

interface ThesisRow {
  id: string;
  headline: string | null;
  paragraph: string | null;
  buckets: Buckets | null;
  facts: Facts | null;
  archetype_id: string | null;
}

interface SearchRow {
  id: string;
  query: string | null;
  leads: RankedLead[] | null;
  status: 'running' | 'complete' | 'failed';
  created_at: string;
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app');

  const { search: requestedSearchId } = await searchParams;

  // Active thesis. If the user has none, send them back through onboarding.
  const { data: thesis } = await supabase
    .from('theses')
    .select('id, headline, paragraph, buckets, facts')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle<Omit<ThesisRow, 'archetype_id'>>();

  if (!thesis) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('archetype')
    .eq('id', user.id)
    .maybeSingle<{ archetype: string | null }>();

  // All search threads for this user+thesis (for sidebar tabs).
  const { data: searches } = await supabase
    .from('searches')
    .select('id, query, leads, status, created_at')
    .eq('user_id', user.id)
    .eq('thesis_id', thesis.id)
    .order('created_at', { ascending: false })
    .returns<SearchRow[]>();

  const allSearches = searches ?? [];

  // Pick the active tab: ?search=<id> if valid, else most recent, else null.
  const activeSearch = requestedSearchId
    ? allSearches.find((s) => s.id === requestedSearchId) ?? null
    : allSearches[0] ?? null;

  // Saved lead IDs (used to render the Save button initial state).
  const { data: savedRows } = await supabase
    .from('saved_leads')
    .select('lead')
    .eq('user_id', user.id)
    .returns<{ lead: RankedLead }[]>();
  const savedLeadIds = new Set((savedRows ?? []).map((r) => r.lead?.id).filter(Boolean));

  return (
    <Workspace
      thesis={{
        id: thesis.id,
        headline: thesis.headline,
        paragraph: thesis.paragraph,
        buckets: thesis.buckets ?? {},
        facts: thesis.facts ?? {},
        archetypeId: profile?.archetype ?? null,
      }}
      searches={allSearches}
      activeSearch={activeSearch}
      savedLeadIds={Array.from(savedLeadIds)}
    />
  );
}
