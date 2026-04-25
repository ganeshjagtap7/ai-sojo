'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RankedLead, SearchCriteria, SearchMetadata } from '@/lib/types';
import type { Buckets, Facts } from '@/lib/flow/types';
import { ResultCard } from './ResultCard';
import { Sidebar } from './Sidebar';

export interface WorkspaceThesis {
  id: string;
  headline: string | null;
  paragraph: string | null;
  buckets: Buckets;
  facts: Facts;
  archetypeId: string | null;
}

export interface SearchSummary {
  id: string;
  query: string | null;
  leads: RankedLead[] | null;
  status: 'running' | 'complete' | 'failed';
  created_at: string;
}

interface Props {
  thesis: WorkspaceThesis;
  searches: SearchSummary[];
  activeSearch: SearchSummary | null;
  savedLeadIds: string[];
}

type ScreenState =
  | { kind: 'initial-loading'; message: string }
  | { kind: 'idle' }
  | { kind: 'running'; message: string }
  | { kind: 'failed'; error: string };

export function Workspace({ thesis, searches, activeSearch, savedLeadIds }: Props) {
  const router = useRouter();
  const [refining, setRefining] = useState(false);
  const [pendingNewSearch, startNewSearch] = useTransition();
  const [screen, setScreen] = useState<ScreenState>(() =>
    !activeSearch && searches.length === 0
      ? { kind: 'initial-loading', message: 'Finding your 10 matches…' }
      : activeSearch?.status === 'running'
      ? { kind: 'running', message: 'Search in progress…' }
      : { kind: 'idle' },
  );
  const kickedRef = useRef(false);

  // Auto-kick the initial search if the user has a thesis but no searches.
  useEffect(() => {
    if (kickedRef.current) return;
    if (searches.length > 0) return;
    kickedRef.current = true;
    runSearch({ query: null, criteriaOverride: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(input: { query: string | null; criteriaOverride: Partial<SearchCriteria> | null }) {
    setScreen({ kind: 'running', message: input.query ? `Searching "${input.query}"…` : 'Finding your 10 matches…' });

    try {
      // Kick off the search pipeline.
      const startRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetype: thesis.archetypeId ? { id: thesis.archetypeId, name: thesis.archetypeId } : null,
          facts: thesis.facts,
          buckets: thesis.buckets,
          criteriaOverride: input.criteriaOverride,
        }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.jobId) {
        throw new Error(startJson.error ?? 'Failed to start search');
      }
      const jobId = startJson.jobId as string;

      // Poll status.
      const completed = await pollUntilDone(jobId);

      // Persist to DB.
      const persistRes = await fetch('/api/app/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesisId: thesis.id,
          query: input.query,
          leads: completed.leads,
          metadata: completed.metadata,
          status: 'complete',
        }),
      });
      const persistJson = await persistRes.json();
      if (!persistRes.ok || !persistJson.searchId) {
        throw new Error(persistJson.error ?? 'Failed to persist search');
      }

      // Navigate to the new search tab and refresh server data.
      router.replace(`/app?search=${persistJson.searchId}`);
      router.refresh();
      setScreen({ kind: 'idle' });
    } catch (err) {
      setScreen({ kind: 'failed', error: err instanceof Error ? err.message : 'Search failed' });
    }
  }

  function handleRefineSubmit(input: { query: string; criteria: Partial<SearchCriteria> }) {
    setRefining(false);
    startNewSearch(() => {
      runSearch({ query: input.query, criteriaOverride: input.criteria });
    });
  }

  const leads = activeSearch?.leads ?? [];
  const showResults = screen.kind === 'idle' && leads.length > 0;

  return (
    <div style={styles.layout}>
      <Sidebar
        thesis={thesis}
        searches={searches}
        activeSearchId={activeSearch?.id ?? null}
        savedCount={savedLeadIds.length}
      />

      <main style={styles.main}>
        <RefineBar
          thesis={thesis}
          disabled={pendingNewSearch || screen.kind === 'running' || screen.kind === 'initial-loading'}
          refining={refining}
          setRefining={setRefining}
          onSubmit={handleRefineSubmit}
        />

        {screen.kind === 'initial-loading' && <LoadingPanel message={screen.message} variant="initial" />}
        {screen.kind === 'running' && <LoadingPanel message={screen.message} variant="refine" />}
        {screen.kind === 'failed' && <ErrorPanel error={screen.error} onRetry={() => runSearch({ query: null, criteriaOverride: null })} />}

        {showResults && (
          <section style={styles.results}>
            <header style={styles.resultsHead}>
              <h2 style={styles.resultsTitle}>
                {activeSearch?.query
                  ? `Refined · ${activeSearch.query}`
                  : `Your ${leads.length} matches for ${thesisHeadline(thesis)}`}
              </h2>
              <span style={styles.resultsCount}>{leads.length} leads</span>
            </header>
            <div style={styles.cards}>
              {leads.map((lead, i) => (
                <ResultCard
                  key={lead.id ?? i}
                  lead={lead}
                  rank={i + 1}
                  searchId={activeSearch?.id ?? null}
                  initialSaved={savedLeadIds.includes(lead.id)}
                />
              ))}
            </div>
          </section>
        )}

        {screen.kind === 'idle' && leads.length === 0 && activeSearch && (
          <div style={styles.empty}>No leads in this search.</div>
        )}
      </main>
    </div>
  );
}

async function pollUntilDone(jobId: string): Promise<{ leads: RankedLead[]; metadata: SearchMetadata | null }> {
  const start = Date.now();
  const timeoutMs = 5 * 60 * 1000;

  while (Date.now() - start < timeoutMs) {
    const statusRes = await fetch(`/api/search/${jobId}/status`);
    const statusJson = await statusRes.json();
    if (statusJson.status === 'complete') {
      const resultsRes = await fetch(`/api/search/${jobId}/results`);
      const resultsJson = await resultsRes.json();
      return { leads: resultsJson.leads ?? [], metadata: resultsJson.metadata ?? null };
    }
    if (statusJson.status === 'failed') {
      throw new Error(statusJson.error ?? 'Search pipeline failed');
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Search timed out');
}

function thesisHeadline(thesis: WorkspaceThesis): string {
  const parts: string[] = [];
  if (thesis.buckets?.archetype) parts.push(thesis.buckets.archetype);
  if (thesis.facts?.geo?.[0]) parts.push(thesis.facts.geo[0]);
  if (thesis.facts?.check) parts.push(thesis.facts.check);
  return `"${parts.join(' · ') || 'your thesis'}"`;
}

function RefineBar({
  thesis,
  disabled,
  refining,
  setRefining,
  onSubmit,
}: {
  thesis: WorkspaceThesis;
  disabled: boolean;
  refining: boolean;
  setRefining: (v: boolean) => void;
  onSubmit: (input: { query: string; criteria: Partial<SearchCriteria> }) => void;
}) {
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState<{ criteria: Partial<SearchCriteria>; summary: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  async function onEnter() {
    if (!query.trim() || disabled || parsing) return;
    setParsing(true);
    setParseError(null);
    setParsed(null);
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, thesis: { facts: thesis.facts, buckets: thesis.buckets } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Refine failed');
      if (!json.criteria || Object.keys(json.criteria).length === 0) {
        throw new Error("We couldn't extract criteria — try rephrasing.");
      }
      setParsed({ criteria: json.criteria, summary: json.summary ?? 'Parsed' });
      setRefining(true);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Refine failed');
    } finally {
      setParsing(false);
    }
  }

  return (
    <div style={styles.refineWrap}>
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder="Refine your search — e.g. &quot;HVAC in Atlanta under $5M rev&quot;"
        style={styles.refineInput}
      />
      {parsing && <div style={styles.refineHint}>Parsing…</div>}
      {parseError && <div style={styles.refineError}>{parseError}</div>}
      {parsed && refining && (
        <div style={styles.confirmBox}>
          <div style={styles.confirmText}>
            We read that as: <strong>{parsed.summary}</strong>
          </div>
          <div style={styles.confirmActions}>
            <button
              type="button"
              style={styles.confirmCancel}
              onClick={() => {
                setRefining(false);
                setParsed(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              style={styles.confirmGo}
              onClick={() => {
                onSubmit({ query, criteria: parsed.criteria });
                setQuery('');
                setParsed(null);
              }}
            >
              Run search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingPanel({ message, variant }: { message: string; variant: 'initial' | 'refine' }) {
  return (
    <div style={styles.loading}>
      <div style={styles.spinner} />
      <h2 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{message}</h2>
      <p style={{ fontSize: 13, color: '#6b7280', margin: 0, maxWidth: 420, textAlign: 'center' }}>
        {variant === 'initial'
          ? 'Scanning Google Maps, BBB, and the open web for businesses that match your thesis. This usually takes 15–30 seconds.'
          : 'Re-running with your refinement. Hold tight.'}
      </p>
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={styles.errorPanel}>
      <h2 style={{ fontSize: 18, margin: 0 }}>Search failed</h2>
      <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{error}</p>
      <button type="button" style={styles.retryBtn} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, minHeight: 'calc(100vh - 52px)' },
  main: { padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 },
  refineWrap: { display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' },
  refineInput: {
    width: '100%',
    padding: '12px 16px',
    fontSize: 15,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    background: '#fff',
    fontFamily: 'inherit',
  },
  refineHint: { fontSize: 12, color: '#6b7280' },
  refineError: { fontSize: 12, color: '#991b1b' },
  confirmBox: {
    background: '#fff',
    border: '1px solid #e5e0d3',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  confirmText: { fontSize: 13, color: '#374151' },
  confirmActions: { display: 'flex', gap: 8 },
  confirmCancel: { padding: '6px 12px', fontSize: 12, border: '1px solid #d1d5db', background: '#fff', borderRadius: 4, cursor: 'pointer' },
  confirmGo: { padding: '6px 12px', fontSize: 12, border: '1px solid #0E0E0C', background: '#0E0E0C', color: '#fff', borderRadius: 4, cursor: 'pointer' },
  results: { display: 'flex', flexDirection: 'column', gap: 14 },
  resultsHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  resultsTitle: { fontSize: 18, fontWeight: 500, margin: 0 },
  resultsCount: { fontSize: 12, color: '#6b7280' },
  cards: { display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { fontSize: 14, color: '#6b7280', textAlign: 'center', padding: 60 },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 24px' },
  errorPanel: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 32, border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2' },
  retryBtn: { padding: '8px 14px', fontSize: 13, border: '1px solid #0E0E0C', background: '#0E0E0C', color: '#fff', borderRadius: 4, cursor: 'pointer' },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid #e5e7eb',
    borderTopColor: '#0E0E0C',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
