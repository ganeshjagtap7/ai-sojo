'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RankedLead } from '@/lib/types';
import { tierOf, locLine } from '@/app/app/_lib/leadScoring';
import { LeadDrawer } from './LeadDrawer';
import { EmptyState } from './EmptyState';
import { ToastStack, useToasts } from './ToastStack';
import { friendlyActionError } from '@/lib/errors/actionError';

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

// Relative time depends on Date.now(), which differs between the server render
// and the client hydration → React hydration mismatch. Compute it only after
// mount; until then show the deterministic absolute date (same on both sides).
function TimeAgo({ iso, ago }: { iso: string; ago?: boolean }) {
  const [rel, setRel] = useState<string | null>(null);
  useEffect(() => { setRel(fmtAgo(iso)); }, [iso]);
  if (rel === null) return <>{iso.slice(0, 10)}</>;
  return <>{ago ? `${rel} ago` : rel}</>;
}

export function SavedView({ rows }: { rows: SavedRow[] }) {
  const router = useRouter();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [drawerLead, setDrawerLead] = useState<RankedLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openLead = (lead: RankedLead) => {
    setDrawerLead(lead);
    setDrawerOpen(true);
  };

  // On the Saved page every lead is already saved, so the drawer's save action
  // removes it. Close the drawer and refresh the list on success.
  const removeFromDrawer = async () => {
    if (!drawerLead) return;
    try {
      const res = await fetch(`/api/app/saved?leadId=${encodeURIComponent(drawerLead.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setDrawerOpen(false);
      router.refresh();
    } catch {
      // Don't fail silently — the drawer just staying open looks like nothing
      // happened. Tell the user so they can retry.
      pushToast("Couldn't remove", 'Please try again');
    }
  };

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
              : (
                <>
                  {rows.length} {rows.length === 1 ? 'business' : 'businesses'} · last added{' '}
                  {rows[0] ? <TimeAgo iso={rows[0].savedAt} ago /> : ''}
                </>
              )}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          eyebrow="Saved leads"
          title={<>Nothing saved <em>yet</em>.</>}
          sub="When a business is worth a call, hit Save on the board and it lands here — with a stage you can move through outreach."
          cta={{ href: '/app', label: 'Go to your board →' }}
        />
      ) : (
        <div className="table-scroll">
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
                <SavedRowEl key={row.id} row={row} onOpen={openLead} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadDrawer
        lead={drawerLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isSaved
        onSave={removeFromDrawer}
      />

      <ToastStack toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

function SavedRowEl({ row, onOpen }: { row: SavedRow; onOpen: (lead: RankedLead) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tier = tierOf(row.lead.matchScore);

  const updateStage = (next: Stage) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/app/saved', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: row.lead.id, stage: next }),
        });
        if (!res.ok) throw new Error('Could not update stage — please try again.');
        router.refresh();
      } catch (err) {
        setError(friendlyActionError(err, 'Could not update stage — please try again.'));
      }
    });
  };

  const unsave = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/app/saved?leadId=${encodeURIComponent(row.lead.id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not remove this lead — please try again.');
        router.refresh();
      } catch (err) {
        setError(friendlyActionError(err, 'Could not remove this lead — please try again.'));
      }
    });
  };

  return (
    <tr style={pending ? { opacity: 0.5 } : undefined}>
      <td
        style={{ fontWeight: 500, cursor: 'pointer' }}
        onClick={() => onOpen(row.lead)}
        title="View details"
      >
        {row.lead.businessName}
      </td>
      <td style={{ color: 'var(--muted)', cursor: 'pointer' }} onClick={() => onOpen(row.lead)}>{locLine(row.lead) || '—'}</td>
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
      <td className="num" style={{ color: 'var(--faint)' }}><TimeAgo iso={row.savedAt} /></td>
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
