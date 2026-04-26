'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RankedLead } from '@/lib/types';
import { tierOf, locLine } from '@/app/app/_lib/leadScoring';

const STAGES = ['New', 'Outreach', 'Discovery', 'LOI sent', 'Passed'] as const;
type Stage = (typeof STAGES)[number];

export interface SavedRow {
  id: string;
  lead: RankedLead;
  stage: string;
  savedAt: string;
}

const STAGE_COLOR: Record<string, string> = {
  New: 'var(--muted)',
  Outreach: 'var(--accent-deep)',
  Discovery: 'var(--accent)',
  'LOI sent': 'var(--success)',
  Passed: 'var(--faint)',
};

const fmtAgo = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
};

export function SavedView({ rows }: { rows: SavedRow[] }) {
  return (
    <div className="simple-page">
      <div className="simple-head">
        <div>
          <h1>
            Your <em>saved</em> leads.
          </h1>
          <div className="sub">
            {rows.length === 0
              ? 'Save leads from search results to track outreach here.'
              : `${rows.length} ${rows.length === 1 ? 'business' : 'businesses'} · last added ${rows[0] ? fmtAgo(rows[0].savedAt) : ''} ago`}
          </div>
        </div>
      </div>

      {rows.length === 0 ? null : (
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Location</th>
              <th className="num">Revenue</th>
              <th className="num">Match</th>
              <th>Stage</th>
              <th className="num">Saved</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SavedRowEl key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SavedRowEl({ row }: { row: SavedRow }) {
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
        setError(j.error ?? 'Update failed');
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
    <tr style={pending ? { opacity: 0.5 } : undefined}>
      <td style={{ fontWeight: 500 }}>{row.lead.businessName}</td>
      <td style={{ color: 'var(--muted)' }}>{locLine(row.lead) || '—'}</td>
      <td className="num">{row.lead.businessDetails?.estimatedRevenue ?? '—'}</td>
      <td className="num">
        <span className={`score-pill ${tier}`}>{row.lead.matchScore}</span>
      </td>
      <td>
        <select
          className="stage-select"
          value={row.stage}
          onChange={(e) => updateStage(e.target.value as Stage)}
          disabled={pending}
          style={{ color: STAGE_COLOR[row.stage] ?? 'inherit' }}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {error && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>}
      </td>
      <td className="num" style={{ color: 'var(--faint)' }}>{fmtAgo(row.savedAt)}</td>
      <td>
        <button
          type="button"
          className="ctrl-btn"
          onClick={unsave}
          disabled={pending}
          title="Remove from saved"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
