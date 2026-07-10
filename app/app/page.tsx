import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Workspace } from './_components/Workspace';
import type { RankedLead } from '@/lib/types';
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

// The sidebar list deliberately excludes the `leads` jsonb — it can be
// megabytes across a user's search history, and only the ACTIVE search's
// leads are ever rendered. They're fetched separately below.
interface SearchRow {
  id: string;
  query: string | null;
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
    .select('id, query, status, created_at')
    .eq('user_id', user.id)
    .eq('thesis_id', thesis.id)
    .order('created_at', { ascending: false })
    .returns<SearchRow[]>();

  const allSearches = (searches ?? []).map((s) => ({ ...s, leads: null }));

  // Pick the active tab: ?search=<id> if valid, else most recent, else null —
  // and fetch leads for that one search only.
  const activeMeta = requestedSearchId
    ? allSearches.find((s) => s.id === requestedSearchId) ?? null
    : allSearches[0] ?? null;

  let activeSearch: (SearchRow & { leads: RankedLead[] | null }) | null = null;
  if (activeMeta) {
    const { data: leadRow } = await supabase
      .from('searches')
      .select('leads')
      .eq('id', activeMeta.id)
      .eq('user_id', user.id)
      .maybeSingle<{ leads: RankedLead[] | null }>();
    activeSearch = { ...activeMeta, leads: leadRow?.leads ?? [] };
  }

  // Saved lead IDs (used to render the Save button initial state) — only the
  // id is needed, not the full lead jsonb.
  const { data: savedRows } = await supabase
    .from('saved_leads')
    .select('leadId:lead->>id')
    .eq('user_id', user.id)
    .returns<{ leadId: string | null }[]>();
  const savedLeadIds = new Set(
    (savedRows ?? []).map((r) => r.leadId).filter((id): id is string => Boolean(id)),
  );

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
