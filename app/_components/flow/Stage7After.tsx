'use client';

import { useEffect, useRef } from 'react';
import { useFlow } from './FlowProvider';
import { useAuth } from '../auth/AuthProvider';
import { Stage7AuthGate } from '../auth/Stage7AuthGate';

export function Stage7After() {
  const { state, dispatch } = useFlow();
  const { user, loading } = useAuth();
  const savedRef = useRef(false);

  const { leads, thesis, archetype, facts, buckets, searchMetadata } = state;

  useEffect(() => {
    if (!user || savedRef.current) return;
    savedRef.current = true;

    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        archetype: archetype?.id ?? null,
        facts,
        buckets,
        thesis,
        leads,
        metadata: searchMetadata,
      }),
    }).catch(() => {
      savedRef.current = false;
    });
  }, [user, archetype, facts, buckets, thesis, leads, searchMetadata]);

  if (loading) {
    return (
      <div className="s7 fade-in">
        <div className="s7-inner" style={{ textAlign: 'center', padding: 40 }}>
          <div className="eye">Loading…</div>
        </div>
      </div>
    );
  }

  if (!user) return <Stage7AuthGate />;

  const topLead = leads[0];
  const topName = topLead?.businessName ?? 'your top target';

  return (
    <div className="s7 fade-in">
      <div className="s7-inner">
        <div className="s7-col">
          <h2>Now it's <em>yours</em>.</h2>
          <p>
            The thesis, target list, and transcript are in your inbox. The file link expires in 30 days, but you own the artifact.
          </p>
          <p style={{marginTop: 20, color: 'var(--ink)'}}>
            What happens next is up to you.
          </p>

          <div className="s7-email" style={{marginTop: 24}}>
            <div className="hdr">
              From <b>Searcher AI &lt;thesis@searcher.ai&gt;</b><br/>
              To you · moments ago
            </div>
            <p className="subj">Your thesis + 10 targets — {topName} is the one to call first</p>
            <div className="body">
              <em>Your consolidator thesis</em> in compliance-driven field services is attached. The top of the list, {topName}, has a warm intro via <em>R. Patel (fund advisor)</em> — I drafted a two-sentence ask you can copy. Take your time.
            </div>
            <div className="links">
              <a href="#">→ Open thesis (PDF)</a>
              <a href="#">→ Download targets (CSV)</a>
              <a href="#">→ View the full transcript</a>
            </div>
          </div>
        </div>

        <div className="s7-col">
          <h2>Want us to <em>keep watching?</em></h2>
          <p>
            Your thesis is saved. Each week we'll rescan the Southeast universe against it — only new names or meaningful changes surface.
          </p>

          <div className="s7-weekly">
            <div className="eye">Sample: next Monday's digest</div>
            {state.leads.slice(0, 3).map((l) => (
              <div className="match" key={l.id}>
                <div>
                  <div className="n">{l.businessName}</div>
                  <div className="loc">{[l.city, l.state].filter(Boolean).join(', ')}</div>
                </div>
                <div className="score">{l.matchScore}</div>
              </div>
            ))}
          </div>

          <button className="iden-cta" style={{marginTop: 20, width: '100%'}} onClick={() => {}}>
            Turn on weekly watch · $600/mo
          </button>
          <div className="caption" style={{textAlign: 'center', marginTop: 10}}>
            Cancel anytime. First digest arrives Monday.
          </div>
        </div>

        <div className="s7-restart">
          <button onClick={() => dispatch({ type: 'RESTART' })}>↻ Start a new thesis from scratch</button>
        </div>
      </div>
    </div>
  );
}
