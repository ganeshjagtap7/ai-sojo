'use client';

import { useEffect, useRef, useState } from 'react';
import { useFlow } from './FlowProvider';
import type { RankedLead } from '@/lib/types';

const LANE_STEPS = [
  { n: 'i. Thesis synthesis', items: [
    'Reading session transcript',
    'Extracting hard disqualifiers',
    'Reconciling facts with conversation',
    'Drafting the one-paragraph thesis',
    'Stress-testing against archetype',
  ] },
  { n: 'ii. Market mapping', items: [
    'Enumerating SIC / NAICS adjacents',
    'Filtering by geo & revenue band',
    'Cross-checking ownership signals',
    'Clustering the long list',
    'Scoring moat proxies',
  ] },
  { n: 'iii. Target shortlist', items: [
    'Ranking by thesis fit score',
    'Pulling succession / age-of-owner signal',
    'Drafting outreach notes per target',
    'Attaching a warm-intro path (if any)',
    'Final sort: top ten',
  ] },
];

type SearchPhase = 'pending' | 'scraping' | 'enriching' | 'ranking' | 'done';

export function Stage5Generate() {
  const { state, dispatch } = useFlow();
  const { buckets, facts, archetype, progressMode } = state;
  const [thesisProgress, setThesisProgress] = useState(0);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('pending');
  const [flagAnswer, setFlagAnswer] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const kickedRef = useRef(false);

  // Tick elapsed for UI clock
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Dev override via tweaks
  useEffect(() => {
    if (progressMode === 'done') { setReady(true); setSearchPhase('done'); setThesisProgress(5); }
    else if (progressMode === 'mid') { setThesisProgress(3); setSearchPhase('enriching'); }
    else if (progressMode === 'early') { setThesisProgress(1); setSearchPhase('scraping'); }
  }, [progressMode]);

  // Kick off thesis + search on mount (auto mode only)
  useEffect(() => {
    if (kickedRef.current || progressMode !== 'auto') return;
    kickedRef.current = true;

    const thesisTimer = setInterval(() => {
      setThesisProgress((p) => Math.min(p + 1, 4));
    }, 3000);

    fetch('/api/thesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archetype, facts, buckets }),
    })
      .then((r) => r.json())
      .then((thesis) => {
        clearInterval(thesisTimer);
        setThesisProgress(5);
        dispatch({ type: 'SET_THESIS', thesis });
      })
      .catch(() => {
        clearInterval(thesisTimer);
        setThesisProgress(5);
      });

    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archetype, facts, buckets }),
    })
      .then((r) => r.json())
      .then(({ jobId }) => {
        if (!jobId) throw new Error('no jobId');
        dispatch({ type: 'START_SEARCH', jobId });
        pollSearch(jobId);
      })
      .catch((err) => {
        dispatch({ type: 'FAIL_SEARCH', error: String(err) });
      });

    return () => clearInterval(thesisTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollSearch(jobId: string) {
    const poll = async () => {
      const res = await fetch(`/api/search/${jobId}/status`).then((r) => r.json());
      if (res.status === 'processing' && res.progress) {
        dispatch({ type: 'UPDATE_PROGRESS', progress: res.progress });
        const step = String(res.progress.step || '').toLowerCase();
        if (step.includes('rank') || step.includes('score')) setSearchPhase('ranking');
        else if (step.includes('enrich') || step.includes('contact')) setSearchPhase('enriching');
        else setSearchPhase('scraping');
        return false;
      }
      if (res.status === 'complete') {
        const r = await fetch(`/api/search/${jobId}/results`).then((r) => r.json());
        const leads: RankedLead[] = r.leads ?? [];
        dispatch({ type: 'COMPLETE_SEARCH', leads, metadata: r.metadata });
        setSearchPhase('done');
        return true;
      }
      if (res.status === 'failed') {
        dispatch({ type: 'FAIL_SEARCH', error: res.error || 'Search failed' });
        return true;
      }
      return false;
    };
    const id = setInterval(async () => { if (await poll()) clearInterval(id); }, 2500);
    await poll();
  }

  useEffect(() => {
    if (thesisProgress >= 5 && searchPhase === 'done') setReady(true);
  }, [thesisProgress, searchPhase]);

  const laneState = (laneIdx: number, itemIdx: number): 'pending' | 'active' | 'done' => {
    if (laneIdx === 0) {
      if (itemIdx < thesisProgress) return 'done';
      if (itemIdx === thesisProgress && thesisProgress < 5) return 'active';
      return 'pending';
    }
    if (laneIdx === 1) {
      const phaseToIdx: Record<SearchPhase, number> = { pending: 0, scraping: 2, enriching: 3, ranking: 5, done: 5 };
      const cutoff = phaseToIdx[searchPhase];
      if (itemIdx < cutoff) return 'done';
      if (itemIdx === cutoff && searchPhase !== 'done') return 'active';
      return searchPhase === 'done' ? 'done' : 'pending';
    }
    if (searchPhase === 'ranking') {
      if (itemIdx < 3) return 'done';
      if (itemIdx === 3) return 'active';
      return 'pending';
    }
    if (searchPhase === 'done') return 'done';
    return 'pending';
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const thesisFlag = state.thesis?.flag;

  return (
    <div className="s5 fade-in">
      <div className="s5-thesis-band">
        <div className="inner">
          <div className="eye">Reading from your thesis</div>
          <p className="t">
            <b>{buckets.archetype || 'The searcher-sized business'}</b> in {(facts.geo || ['Southeast']).join(', ')}
            · moat via {buckets.stickiness || 'switching cost'} · walk away on {buckets.disqualifier || 'concentration >40%'}.
          </p>
        </div>
      </div>

      <div className="s5-feed-band">
        <div className="s5-feed-inner">
          <div className="s5-head">
            <div className="s5-head-l">
              <div className="eye">§ Five · Generating</div>
              <h2>Working <em>in public</em>.</h2>
            </div>
            <div className="s5-head-r">
              <div className="time">{fmtTime(elapsed)} / 4:00</div>
              <div className="sub">{ready ? 'Ready' : 'Running'}</div>
            </div>
          </div>

          <div className="s5-lanes">
            {LANE_STEPS.map((lane, li) => (
              <div className="s5-lane" key={li}>
                <div className="s5-lane-h">
                  <div className="s5-lane-n">{lane.n}</div>
                </div>
                <ul className="s5-log">
                  {lane.items.map((item, ii) => (
                    <li key={ii} className={`s5-li ${laneState(li, ii)}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {thesisFlag && !ready && (
            <div className="s5-idle">
              <div className="lbl">One flag</div>
              <p className="q">{thesisFlag}</p>
              <input
                placeholder="Type an answer — it keeps going in the background"
                value={flagAnswer}
                onChange={(e) => setFlagAnswer(e.target.value)}
              />
            </div>
          )}

          {ready && (
            <div className="s5-ready-card">
              <div className="t">Done. Your thesis and ten targets are ready.</div>
              <button onClick={() => dispatch({ type: 'SET_STAGE', stage: 6 })}>Open the deliverable →</button>
            </div>
          )}

          {state.searchError && (
            <div className="s5-idle" style={{ borderColor: 'var(--crimson)' }}>
              <div className="lbl" style={{ color: 'var(--crimson)' }}>Error</div>
              <p className="q">{state.searchError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
