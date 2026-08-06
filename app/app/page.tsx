import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Workspace } from './_components/Workspace';
import type { RankedLead, SearchMetadata } from '@/lib/types';
import type { Buckets, Facts } from '@/lib/flow/types';

export const dynamic = 'force-dynamic';
// Serve near the Supabase DB (Mumbai) — these pages are pure DB reads, and the
// team is in India; iad1 would add two ocean round-trips per navigation (#12).
export const preferredRegion = 'bom1';

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
  search_metadata: SearchMetadata | null;
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
    // Carry a notice so the wizard can explain the bounce — otherwise clicking
    // "Workspace" with no active thesis silently loops back here with no signal.
    redirect('/?notice=finish-onboarding');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('archetype')
    .eq('id', user.id)
    .maybeSingle<{ archetype: string | null }>();

  // All search threads for this user+thesis (for sidebar tabs).
  const { data: searches } = await supabase
    .from('searches')
    .select('id, query, leads, status, created_at, search_metadata')
    .eq('user_id', user.id)
    .eq('thesis_id', thesis.id)
    .order('created_at', { ascending: false })
    .returns<SearchRow[]>();

  const allSearches = searches ?? [];

  // Pick the active tab: ?search=<id> if valid, else most recent, else null.
  // An unknown ?search= id (deep link to another thesis's search, stale URL)
  // must not blank the pane — fall back to the most recent search.
  const activeSearch =
    (requestedSearchId ? allSearches.find((s) => s.id === requestedSearchId) : undefined) ??
    allSearches[0] ??
    null;

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
