'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LS_KEY } from '@/app/_components/flow/FlowProvider';

export interface ThesisRow {
  id: string;
  headline: string | null;
  paragraph: string | null;
  is_active: boolean;
  created_at: string;
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

export function ThesisManager({ initial }: { initial: ThesisRow[] }) {
  const router = useRouter();
  const [theses, setTheses] = useState<ThesisRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null); // thesisId being activated, or 'new'
  const [error, setError] = useState<string | null>(null);

  async function activate(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch('/api/app/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesisId: id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setTheses((prev) => prev.map((t) => ({ ...t, is_active: t.id === id })));
      router.push('/app'); // land in the workspace with the newly-active thesis
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch thesis');
      setBusy(null);
    }
  }

  async function newThesis() {
    if (busy) return;
    setBusy('new');
    setError(null);
    try {
      // Deactivate the current thesis, then send the user through the wizard.
      await fetch('/api/app/redo-thesis', { method: 'POST' });
      // Reset the wizard's client state too — otherwise the old draft in
      // localStorage resumes at Stage 6 instead of a fresh Stage-0 start.
      try {
        localStorage.removeItem(LS_KEY);
      } catch {
        // Storage disabled — not fatal.
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new thesis');
      setBusy(null);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <button type="button" className="btn-primary" onClick={newThesis} disabled={busy !== null}>
          {busy === 'new' ? 'Starting…' : '+ New thesis'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {theses.length === 0 ? (
        <p style={styles.empty}>No theses yet. Start one to begin searching.</p>
      ) : (
        <ul style={styles.list}>
          {theses.map((t) => (
            <li key={t.id} style={{ ...styles.card, ...(t.is_active ? styles.cardActive : {}) }}>
              <div style={styles.cardMain}>
                <div style={styles.cardHead}>
                  <span style={styles.cardTitle}>{t.headline || 'Untitled thesis'}</span>
                  {t.is_active && <span style={styles.badge}>Active</span>}
                </div>
                {t.paragraph && <p style={styles.para}>{t.paragraph}</p>}
                <div style={styles.date}>{fmtDate(t.created_at)}</div>
              </div>
              {!t.is_active && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => activate(t.id)}
                  disabled={busy !== null}
                  style={styles.activateBtn}
                >
                  {busy === t.id ? 'Switching…' : 'Make active'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' },
  topRow: { display: 'flex', justifyContent: 'flex-end' },
  error: { fontSize: 13, color: 'var(--danger)', margin: 0 },
  empty: { fontSize: 14, color: 'var(--muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
    padding: '16px 18px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12,
  },
  cardActive: { boxShadow: 'inset 0 0 0 1px var(--success)', borderColor: 'var(--success)' },
  cardMain: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10 },
  cardTitle: { fontFamily: 'var(--font-instrument), serif', fontSize: 18, letterSpacing: '-0.02em' },
  badge: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--success)', border: '1px solid var(--success)', borderRadius: 999, padding: '1px 8px',
  },
  para: {
    margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  date: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--faint)' },
  activateBtn: { flexShrink: 0 },
};
