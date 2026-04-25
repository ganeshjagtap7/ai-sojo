'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RankedLead } from '@/lib/types';
import { tierOf, locLine, industryOf } from '@/app/app/_lib/leadScoring';

const STAGES = ['New', 'Outreach', 'Discovery', 'LOI sent', 'Passed'] as const;
type Stage = (typeof STAGES)[number];

export interface SavedRow {
  id: string;
  lead: RankedLead;
  stage: string;
  savedAt: string;
}

const TIER_COLOR: Record<'a' | 'b' | 'c', string> = {
  a: '#16a34a',
  b: '#d97706',
  c: '#6b7280',
};

export function SavedView({ rows }: { rows: SavedRow[] }) {
  return (
    <div style={styles.layout}>
      <aside style={styles.aside}>
        <Link href="/app" style={styles.backLink}>← Back to workspace</Link>
        <div style={styles.eyebrow}>Saved leads</div>
        <div style={styles.count}>{rows.length} total</div>
      </aside>
      <main style={styles.main}>
        {rows.length === 0 && <div style={styles.empty}>Save leads from the workspace to track outreach here.</div>}
        {STAGES.map((stage) => {
          const inStage = rows.filter((r) => r.stage === stage);
          if (inStage.length === 0) return null;
          return (
            <section key={stage} style={styles.section}>
              <header style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>{stage}</h2>
                <span style={styles.sectionCount}>{inStage.length}</span>
              </header>
              <div style={styles.cards}>
                {inStage.map((row) => (
                  <SavedCard key={row.id} row={row} />
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

function SavedCard({ row }: { row: SavedRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tier = tierOf(row.lead.matchScore);

  const updateStage = (next: Stage) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/app/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: row.lead.id, stage: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed');
        return;
      }
      router.refresh();
    });
  };

  const unsave = () => {
    startTransition(async () => {
      const res = await fetch(`/api/app/saved?leadId=${encodeURIComponent(row.lead.id)}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
      else setError('Unsave failed');
    });
  };

  return (
    <article style={styles.card}>
      <div style={styles.cardHead}>
        <div>
          <h3 style={styles.cardName}>{row.lead.businessName}</h3>
          <div style={styles.cardMeta}>
            {industryOf(row.lead)} · {locLine(row.lead) || '—'}
          </div>
        </div>
        <div style={{ ...styles.score, color: TIER_COLOR[tier] }}>{row.lead.matchScore}</div>
      </div>
      <div style={styles.cardActions}>
        <select
          value={row.stage}
          disabled={pending}
          onChange={(e) => updateStage(e.target.value as Stage)}
          style={styles.stageSelect}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="button" style={styles.unsave} onClick={unsave} disabled={pending}>
          Unsave
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: '#991b1b' }}>{error}</div>}
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 52px)' },
  aside: { borderRight: '1px solid #e5e0d3', padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 6 },
  backLink: { fontSize: 12, color: '#374151', textDecoration: 'none', marginBottom: 12 },
  eyebrow: { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' },
  count: { fontSize: 14, fontWeight: 500 },
  main: { padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 },
  empty: { fontSize: 14, color: '#6b7280', textAlign: 'center', padding: 60 },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: 16, fontWeight: 500, margin: 0 },
  sectionCount: { fontSize: 11, color: '#6b7280' },
  cards: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { background: '#fff', border: '1px solid #e5e0d3', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardName: { fontSize: 15, fontWeight: 600, margin: 0 },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  score: { fontSize: 20, fontWeight: 700 },
  cardActions: { display: 'flex', gap: 8, alignItems: 'center' },
  stageSelect: { fontSize: 12, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff' },
  unsave: { fontSize: 12, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' },
};
