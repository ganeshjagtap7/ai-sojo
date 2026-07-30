'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RankedLead, SearchCriteria, SearchMetadata } from '@/lib/types';
import type { Buckets, Facts } from '@/lib/flow/types';
import type { ProgressEvent } from '@/lib/pipeline/searchPipeline';
import { ResultCard } from './ResultCard';
import { LeadDrawer } from './LeadDrawer';
import { ToastStack, useToasts } from './ToastStack';

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
  search_metadata?: SearchMetadata | null;
}

interface Props {
  thesis: WorkspaceThesis;
  searches: SearchSummary[];
  activeSearch: SearchSummary | null;
  savedLeadIds: string[];
}

type ScreenState =
  | { kind: 'initial-loading' }
  | { kind: 'idle' }
  | { kind: 'running'; label: string; sub: string }
  | { kind: 'empty-thesis' }
  | { kind: 'failed'; error: string };

type FilterTab = 'all' | 'top' | 'saved';

export function Workspace({ thesis, searches, activeSearch, savedLeadIds: initialSavedIds }: Props) {
  const router = useRouter();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [screen, setScreen] = useState<ScreenState>(() =>
    !activeSearch && searches.length === 0
      ? { kind: 'initial-loading' }
      : activeSearch?.status === 'running'
      ? // Searches persist only on completion now, so a stored 'running' status
        // is a stale row from the old async flow — never an actual in-flight
        // search. Rendering it as running would spin forever with no request
        // behind it; surface it as retryable instead.
        { kind: 'failed', error: 'This search never finished — run it again.' }
      : { kind: 'idle' },
  );
  const [filter, setFilter] = useState<FilterTab>('all');
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set(initialSavedIds));
  const [drawerLead, setDrawerLead] = useState<RankedLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refineQuery, setRefineQuery] = useState('');
  const [refining, setRefining] = useState(false);
  const [parsed, setParsed] = useState<{ criteria: Partial<SearchCriteria>; summary: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const kickedRef = useRef(false);

  const thesisIsEmpty =
    Object.keys(thesis.facts ?? {}).length === 0 && Object.keys(thesis.buckets ?? {}).length === 0;

  // Auto-kick the initial search if the user has a thesis but no searches.
  // A thesis with no captured answers (issue #11) would search for nothing —
  // show the rebuild prompt instead of burning a doomed search.
  useEffect(() => {
    if (kickedRef.current) return;
    if (searches.length > 0) return;
    kickedRef.current = true;
    if (thesisIsEmpty) {
      setScreen({ kind: 'empty-thesis' });
      return;
    }
    runSearch({ query: null, criteriaOverride: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRebuildThesis() {
    try {
      await fetch('/api/app/redo-thesis', { method: 'POST' });
    } catch {
      // Even if deactivation fails, send them to the wizard — a new save
      // deactivates the old thesis anyway.
    }
    window.location.href = '/';
  }

  async function runSearch(input: { query: string | null; criteriaOverride: Partial<SearchCriteria> | null }) {
    // Refinement re-runs get refine copy; a plain (or auto-kicked first) search
    // must not claim to be "re-ranking a refinement" — that copy confused real
    // users into thinking the app was stuck (issue #8).
    const sub = input.criteriaOverride
      ? 'Re-ranking against your refinement.'
      : 'Scanning live sources — usually takes 1–2 minutes.';
    setScreen({ kind: 'running', label: input.query ? `Searching · ${input.query}` : 'Finding your matches…', sub });

    try {
      // /api/search streams SSE progress events as the pipeline advances, then a
      // terminal { type: 'result' } (or { type: 'error' }). We POST once and read
      // the body with a reader loop, driving the running label off each progress
      // event and capturing leads + metadata from the result event.
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetype: thesis.archetypeId ? { id: thesis.archetypeId, name: thesis.archetypeId } : null,
          facts: thesis.facts,
          buckets: thesis.buckets,
          criteriaOverride: input.criteriaOverride,
        }),
        // The server function is capped at 300s; if the stream hangs past that
        // the abort turns an invisible hang into the failed screen with retry.
        signal: AbortSignal.timeout(330_000),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Search failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: { leads: RankedLead[]; metadata: unknown } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          let ev: { type?: string; leads?: RankedLead[]; metadata?: unknown; errorText?: string } & Partial<ProgressEvent>;
          try {
            ev = JSON.parse(raw);
          } catch {
            continue; // ignore malformed lines
          }
          if (ev.type === 'progress') {
            setScreen({ kind: 'running', label: progressLabel(ev as ProgressEvent), sub });
          } else if (ev.type === 'result') {
            result = { leads: ev.leads ?? [], metadata: ev.metadata };
          } else if (ev.type === 'error') {
            throw new Error(ev.errorText ?? 'Search failed');
          }
        }
      }

      if (!result) throw new Error('Search ended without a result.');
      const json = result;

      const persistRes = await fetch('/api/app/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesisId: thesis.id,
          query: input.query,
          leads: json.leads,
          metadata: json.metadata,
          status: 'complete',
        }),
      });
      const persistJson = await persistRes.json();
      if (!persistRes.ok || !persistJson.searchId) throw new Error(persistJson.error ?? 'Failed to persist search');

      router.replace(`/app?search=${persistJson.searchId}`);
      router.refresh();
      setScreen({ kind: 'idle' });
      pushToast('Search complete', `${json.leads.length} leads ranked`);
    } catch (err) {
      setScreen({ kind: 'failed', error: err instanceof Error ? err.message : 'Search failed' });
    }
  }

  async function onSubmitRefine() {
    const q = refineQuery.trim();
    if (!q || refining) return;
    setRefining(true);
    setParseError(null);
    setParsed(null);
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, thesis: { facts: thesis.facts, buckets: thesis.buckets } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Refine failed');
      if (!json.criteria || Object.keys(json.criteria).length === 0) {
        throw new Error("We couldn't extract criteria — try rephrasing.");
      }
      setParsed({ criteria: json.criteria, summary: json.summary ?? 'Parsed' });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Refine failed');
    } finally {
      setRefining(false);
    }
  }

  async function onConfirmRefine() {
    if (!parsed) return;
    const q = refineQuery.trim();
    setRefineQuery('');
    setParsed(null);
    await runSearch({ query: q, criteriaOverride: parsed.criteria });
  }

  // Returns whether the save/unsave actually succeeded, so callers can toast the
  // truth instead of always claiming success. Network failure (offline) is
  // caught here rather than bubbling up as an unhandled rejection.
  async function onSaveToggle(lead: RankedLead, nextSaved: boolean): Promise<boolean> {
    try {
      if (nextSaved) {
        const res = await fetch('/api/app/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead, searchId: activeSearch?.id ?? null }),
        });
        if (!res.ok) return false;
        setSavedSet((s) => new Set([...s, lead.id]));
        router.refresh();
        return true;
      } else {
        const res = await fetch(`/api/app/saved?leadId=${encodeURIComponent(lead.id)}`, { method: 'DELETE' });
        if (!res.ok) return false;
        setSavedSet((s) => {
          const next = new Set(s);
          next.delete(lead.id);
          return next;
        });
        router.refresh();
        return true;
      }
    } catch {
      return false;
    }
  }

  const allLeads = activeSearch?.leads ?? [];
  const filtered = filter === 'top'
    ? allLeads.filter((l) => l.matchScore >= 85)
    : filter === 'saved'
    ? allLeads.filter((l) => savedSet.has(l.id))
    : allLeads;

  const showResults = screen.kind === 'idle' && allLeads.length > 0;
  const queryDescription = activeSearch?.query
    ? activeSearch.query
    : thesisOneLiner(thesis);
  const titleParts = thesisTitleParts(thesis, activeSearch);

  return (
    <div className="view active">
      <div className="results-wrap">
        <header className="results-head">
          <div className="results-head-left">
            <div className="results-head-title">
              <span>
                {activeSearch ? `Found ` : `Searching for `}
                <em>
                  {titleParts.industry}
                  {titleParts.where ? ` in ${titleParts.where}` : ''}
                </em>
                .
              </span>
            </div>
            <div className="results-head-meta">
              <span>{searches.length} {searches.length === 1 ? 'search' : 'searches'}</span>
              {activeSearch && (
                <>
                  <span className="sep">·</span>
                  <span>ranked by match</span>
                  {activeSearch.search_metadata && (
                    <>
                      <span className="sep">·</span>
                      <span>
                        {activeSearch.search_metadata.sourcesUsed.length} sources · {activeSearch.search_metadata.totalScraped} scraped → {activeSearch.search_metadata.afterFiltering} qualified · {activeSearch.search_metadata.searchDurationSeconds}s
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="results-head-actions">
            <Link href="/app/history" className="btn-secondary">History</Link>
            <Link href="/app/saved" className="btn-secondary">Saved</Link>
          </div>
        </header>

        {searches.length > 0 && (
          <div className="results-toolbar">
            <div className="filters">
              <button
                type="button"
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All <span className="count">{allLeads.length}</span>
              </button>
              <button
                type="button"
                className={`filter-tab ${filter === 'top' ? 'active' : ''}`}
                onClick={() => setFilter('top')}
              >
                Top matches <span className="count">{allLeads.filter((l) => l.matchScore >= 85).length}</span>
              </button>
              <button
                type="button"
                className={`filter-tab ${filter === 'saved' ? 'active' : ''}`}
                onClick={() => setFilter('saved')}
              >
                Saved <span className="count">{allLeads.filter((l) => savedSet.has(l.id)).length}</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {searches.map((s, i) => (
                <Link
                  key={s.id}
                  href={`/app?search=${s.id}`}
                  className={`filter-tab ${activeSearch?.id === s.id ? 'active' : ''}`}
                  title={s.query ?? 'Initial search'}
                >
                  {s.query ? (s.query.length > 24 ? s.query.slice(0, 24) + '…' : s.query) : `v${searches.length - i}`}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="results-body">
          {screen.kind === 'initial-loading' && <SearchingPanel label="Finding your matches" sub="Scanning Google Maps, BBB, and the open web. Usually takes 15–60 seconds." />}
          {screen.kind === 'running' && <SearchingPanel label={screen.label} sub={screen.sub} />}
          {screen.kind === 'empty-thesis' && (
            <div className="searching">
              <h2 className="searching-title">Your thesis is <em>empty</em>.</h2>
              <p className="searching-sub">
                No industry or location was saved from onboarding, so there&apos;s nothing to search yet.
                Rebuild your thesis — or just type a full mandate below (e.g. &quot;HVAC business in Atlanta under $5M&quot;).
              </p>
              <button className="btn-primary" type="button" onClick={onRebuildThesis}>
                Rebuild thesis
              </button>
            </div>
          )}
          {screen.kind === 'failed' && (
            <div className="searching">
              <h2 className="searching-title">Search <em>failed</em>.</h2>
              <p className="searching-sub">{screen.error}</p>
              <button className="btn-primary" type="button" onClick={() => runSearch({ query: null, criteriaOverride: null })}>
                Try again
              </button>
            </div>
          )}

          {showResults && (
            <>
              <div className="query-strip">
                <div className="text">
                  Search · <em>{queryDescription}</em>
                </div>
                <div className="meta">
                  <span className="version">v{searches.findIndex((s) => s.id === activeSearch?.id) >= 0 ? searches.length - searches.findIndex((s) => s.id === activeSearch?.id) : 1}</span>
                  <span className="ok">● complete</span>
                  <span className="sep">·</span>
                  <span>{filtered.length}/{allLeads.length}</span>
                </div>
              </div>

              <div className="results-grid">
                {filtered.map((lead, i) => (
                  <ResultCard
                    key={lead.id ?? i}
                    lead={lead}
                    rank={allLeads.indexOf(lead) + 1}
                    searchId={activeSearch?.id ?? null}
                    initialSaved={savedSet.has(lead.id)}
                    onOpen={(l) => {
                      setDrawerLead(l);
                      setDrawerOpen(true);
                    }}
                    onSaveToggle={onSaveToggle}
                    toast={pushToast}
                  />
                ))}
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontSize: 14 }}>
                    {filter === 'top' ? 'No matches scored ≥ 85 in this search.' : filter === 'saved' ? 'You haven\'t saved any of these leads.' : 'No leads in this search.'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {screen.kind !== 'running' && screen.kind !== 'initial-loading' && (
          <div className="refine-dock">
            <div className="refine-composer">
              <div className="refine-head">
                <div className="refine-title">
                  Sojo · <em>search any mandate</em>
                </div>
              </div>
              {parsed && (
                <div style={{ padding: '8px 0', borderTop: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                    We read that as: <strong>{parsed.summary}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => { setParsed(null); }}>
                      Cancel
                    </button>
                    <button type="button" className="btn-primary" onClick={onConfirmRefine}>
                      Run search
                    </button>
                  </div>
                </div>
              )}
              {parseError && (
                <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--danger)' }}>{parseError}</div>
              )}
              {!parsed && (
                <div className="refine-input-row">
                  <input
                    type="text"
                    value={refineQuery}
                    onChange={(e) => setRefineQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onSubmitRefine();
                      }
                    }}
                    placeholder='Type any mandate in plain English — e.g. "HVAC business in Atlanta under $5M"'
                    disabled={refining}
                  />
                  <button type="button" className="send-btn" onClick={onSubmitRefine} disabled={refining || !refineQuery.trim()}>
                    {refining ? (
                      <div className="plog-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M7 17L17 7M8 7h9v9" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <LeadDrawer
        lead={drawerLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isSaved={drawerLead ? savedSet.has(drawerLead.id) : false}
        onSave={async () => {
          if (!drawerLead) return;
          const next = !savedSet.has(drawerLead.id);
          const ok = await onSaveToggle(drawerLead, next);
          if (ok) {
            pushToast(next ? 'Saved' : 'Removed from saved', drawerLead.businessName);
          } else {
            pushToast(next ? "Couldn't save" : "Couldn't remove", 'Please try again');
          }
        }}
      />

      <ToastStack toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

function SearchingPanel({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="searching">
      <h1 className="searching-title">
        {label.includes('·') ? label.split('·').slice(0, 1).join('') : 'Searching for '}
        <em>{label.includes('·') ? label.split('·').slice(1).join('·').trim() : 'matches'}</em>
        .
      </h1>
      <p className="searching-sub">{sub}</p>
      <div className="sketch-count">
        {/* Prominent spinning wheel — clear visual confirmation the search is active. */}
        <span
          className="plog-spin"
          style={{
            width: 44,
            height: 44,
            borderWidth: 4,
            borderColor: 'color-mix(in oklch, var(--accent) 20%, transparent)',
            borderTopColor: 'var(--accent-deep)',
          }}
        />
        <div className="l" style={{ color: 'var(--muted)' }}>searching…</div>
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  google_maps: 'Google Maps',
  web_search: 'the open web',
  bbb: 'BBB',
  yellowpages: 'YellowPages',
  manta: 'Manta',
  businessesforsale: 'BusinessesForSale',
  businessex: 'BusinessEx',
  buybiz: 'BuyBiz',
  smedealz: 'smeDealz',
  franchisegator: 'FranchiseGator',
  sideprojectors: 'SideProjectors',
  trustmrr: 'TrustMRR',
  producthunt: 'Product Hunt',
  hvacinformed: 'HVACinformed',
  esa: 'ESA contractors',
  serviceexperts: 'Service Experts',
};

function progressLabel(ev: ProgressEvent): string {
  switch (ev.phase) {
    case 'queries':
      return 'Generating search queries…';
    case 'source':
      return `Scanning ${SOURCE_LABELS[ev.source] ?? ev.source}… ${ev.index} of ${ev.total}`;
    case 'dedup':
      return `De-duplicating ${ev.count} leads…`;
    case 'enriching':
      return `Enriching ${ev.count} businesses…`;
    case 'ranking':
      return 'Ranking matches…';
  }
}

function thesisOneLiner(thesis: WorkspaceThesis): string {
  const parts: string[] = [];
  if (thesis.buckets?.archetype) parts.push(thesis.buckets.archetype);
  if (thesis.facts?.geo?.[0]) parts.push(thesis.facts.geo[0]);
  if (thesis.facts?.check) parts.push(thesis.facts.check);
  return parts.join(' · ') || 'your thesis';
}

function thesisTitleParts(thesis: WorkspaceThesis, activeSearch: SearchSummary | null) {
  const industry = thesis.buckets?.opening || thesis.buckets?.archetype || 'matches';
  const where = thesis.facts?.geo?.[0] ?? null;
  if (activeSearch?.query) {
    return { industry: activeSearch.query, where: null };
  }
  return { industry, where };
}
