import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { HistoryRow } from '@/app/app/_components/HistoryRow';
import { EmptyState } from '@/app/app/_components/EmptyState';

export const dynamic = 'force-dynamic';
// Serve near the Supabase DB (Mumbai) — these pages are pure DB reads, and the
// team is in India; iad1 would add two ocean round-trips per navigation (#12).
export const preferredRegion = 'bom1';

interface SearchRow {
  id: string;
  thesis_id: string;
  query: string | null;
  status: 'running' | 'complete' | 'failed';
  created_at: string;
  leads: unknown;
}

const fmtAgo = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const labelFor = (q: string | null) => (q ? q : 'Initial · from thesis');

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/history');

  const { data } = await supabase
    .from('searches')
    .select('id, thesis_id, query, status, created_at, leads')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<SearchRow[]>();

  const rows = data ?? [];

  const { data: activeThesis } = await supabase
    .from('theses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle<{ id: string }>();
  const activeThesisId = activeThesis?.id ?? null;

  return (
    <div className="simple-page">
      <div className="simple-head">
        <div>
          <h1>
            Search <em>history</em>.
          </h1>
          <div className="sub">
            {rows.length === 0
              ? 'Every query you run lands here, ranked by recency.'
              : `${rows.length} ${rows.length === 1 ? 'search' : 'searches'} · most recent ${rows[0] ? fmtAgo(rows[0].created_at) : ''}`}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          eyebrow="Search history"
          title={<>No searches <em>yet</em>.</>}
          sub="Every search you run is saved here so you can jump back to any board. Run your first one from your workspace."
          cta={{ href: '/app', label: 'Start searching →' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
          {rows.map((r) => {
            const otherThesis = activeThesisId !== null && r.thesis_id !== activeThesisId;
            const leadCount = Array.isArray(r.leads) ? r.leads.length : 0;
            const statusColor = r.status === 'running' ? 'var(--accent-deep)' : r.status === 'failed' ? 'var(--danger)' : 'var(--success)';
            return (
              <HistoryRow
                key={r.id}
                searchId={r.id}
                thesisId={r.thesis_id}
                needsSwitch={otherThesis}
                label={labelFor(r.query)}
                status={r.status}
                statusColor={statusColor}
                agoText={fmtAgo(r.created_at)}
                leadCount={leadCount}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
