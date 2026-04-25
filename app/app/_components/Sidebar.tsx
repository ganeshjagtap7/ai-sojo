'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { WorkspaceThesis, SearchSummary } from './Workspace';

interface Props {
  thesis: WorkspaceThesis;
  searches: SearchSummary[];
  activeSearchId: string | null;
  savedCount: number;
}

export function Sidebar({ thesis, searches, activeSearchId, savedCount }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [redoOpen, setRedoOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const initialSearch = searches.find((s) => s.query === null) ?? null;
  const refinedSearches = searches.filter((s) => s.query !== null);

  const onRedo = () => {
    startTransition(async () => {
      const res = await fetch('/api/app/redo-thesis', { method: 'POST' });
      if (res.ok) {
        // Hard reload back to onboarding so the FlowProvider boots clean.
        window.location.href = '/';
      } else {
        alert('Failed to redo thesis');
      }
    });
  };

  return (
    <aside style={styles.aside}>
      <section style={styles.section}>
        <div style={styles.eyebrow}>Your thesis</div>
        <div style={styles.thesisLine}>{thesisOneLiner(thesis)}</div>
        {thesis.headline && <div style={styles.thesisHeadline}>{thesis.headline}</div>}
        <button type="button" style={styles.linkBtn} onClick={() => setRedoOpen((o) => !o)}>
          {redoOpen ? 'Cancel' : 'Redo thesis'}
        </button>
        {redoOpen && (
          <div style={styles.redoBox}>
            <p style={styles.redoText}>
              This deactivates your current thesis. Old searches stay viewable; new searches will use the new thesis.
            </p>
            <button type="button" style={styles.redoConfirm} disabled={pending} onClick={onRedo}>
              {pending ? 'Working…' : 'Redo thesis →'}
            </button>
          </div>
        )}
      </section>

      <section style={styles.section}>
        <div style={styles.eyebrow}>Searches</div>
        <ul style={styles.list}>
          {initialSearch && (
            <li>
              <Link
                href={`/app?search=${initialSearch.id}`}
                style={tabStyle(activeSearchId === initialSearch.id || (!activeSearchId && search.get('search') === null))}
              >
                Initial · from thesis
              </Link>
            </li>
          )}
          {refinedSearches.map((s) => (
            <li key={s.id}>
              <Link href={`/app?search=${s.id}`} style={tabStyle(activeSearchId === s.id)}>
                {(s.query ?? '').slice(0, 40)}
              </Link>
            </li>
          ))}
          {searches.length === 0 && <li style={styles.empty}>No searches yet</li>}
        </ul>
      </section>

      <section style={styles.section}>
        <div style={styles.eyebrow}>Saved</div>
        <Link href="/app/saved" style={styles.savedLink}>
          {savedCount === 0 ? 'No saved leads yet' : `${savedCount} saved lead${savedCount === 1 ? '' : 's'}`}
        </Link>
      </section>
    </aside>
  );
}

function thesisOneLiner(thesis: WorkspaceThesis): string {
  const parts: string[] = [];
  if (thesis.buckets?.archetype) parts.push(thesis.buckets.archetype);
  if (thesis.facts?.geo?.[0]) parts.push(thesis.facts.geo[0]);
  if (thesis.facts?.check) parts.push(thesis.facts.check);
  return parts.join(' · ') || 'Active thesis';
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block',
    padding: '6px 10px',
    fontSize: 13,
    borderRadius: 4,
    textDecoration: 'none',
    color: active ? '#fff' : '#374151',
    background: active ? '#0E0E0C' : 'transparent',
  };
}

const styles: Record<string, React.CSSProperties> = {
  aside: {
    borderRight: '1px solid #e5e0d3',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    background: '#fff',
    overflowY: 'auto',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  eyebrow: { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' },
  thesisLine: { fontSize: 14, fontWeight: 500 },
  thesisHeadline: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  linkBtn: {
    fontSize: 11,
    padding: 0,
    background: 'none',
    border: 'none',
    color: '#0E0E0C',
    textDecoration: 'underline',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  redoBox: { marginTop: 8, padding: 10, border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2' },
  redoText: { fontSize: 11, color: '#7f1d1d', margin: '0 0 8px' },
  redoConfirm: { fontSize: 11, padding: '4px 10px', border: '1px solid #991b1b', background: '#991b1b', color: '#fff', borderRadius: 4, cursor: 'pointer' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  empty: { fontSize: 12, color: '#9ca3af', padding: '4px 0' },
  savedLink: { fontSize: 13, color: '#374151', textDecoration: 'none', padding: '4px 0' },
};
