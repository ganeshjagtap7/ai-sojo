import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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

      {rows.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
          {rows.map((r) => {
            const otherThesis = activeThesisId !== null && r.thesis_id !== activeThesisId;
            const leadCount = Array.isArray(r.leads) ? r.leads.length : 0;
            const statusColor = r.status === 'running' ? 'var(--accent-deep)' : r.status === 'failed' ? 'var(--danger)' : 'var(--success)';
            return (
              <Link
                key={r.id}
                href={otherThesis ? '/app/theses' : `/app?search=${r.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: 20,
                  alignItems: 'center',
                  padding: '14px 4px',
                  borderBottom: '1px solid var(--hairline)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 140ms',
                }}
              >
                <div>
                  <div style={{ fontSize: 15, marginBottom: 2 }}>{labelFor(r.query)}</div>
                  <div
                    style={{
                      fontFamily: 'var(--font-geist-mono), monospace',
                      fontSize: 11,
                      color: 'var(--faint)',
                      letterSpacing: '0.03em',
                    }}
                  >
                    <span style={{ color: statusColor }}>● {r.status}</span> · {fmtAgo(r.created_at)}
                    {otherThesis ? ' · different thesis' : ''}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-instrument), serif',
                    fontSize: 22,
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {leadCount}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-geist-mono), monospace',
                    fontSize: 10.5,
                    color: 'var(--faint)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  leads
                </div>
                <span className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>{otherThesis ? 'Switch thesis' : 'Open'}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
