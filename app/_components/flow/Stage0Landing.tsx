'use client';

import { useState } from 'react';
import { useFlow } from './FlowProvider';

// Stage 0: landing / first contact
export function Stage0Landing() {
  const { dispatch } = useFlow();
  const [name, setName] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    dispatch({ type: 'SET_STAGE', stage: 1 });
  };
  return (
    <div className="lp fade-in">
      <div className="lp-body">
        <div className="lp-main">
          <div className="lp-eye">Searcher AI · Est. 2026 · Private Beta</div>
          <div className="lp-rule"></div>
          <h1 className="lp-h">
            An <em>investment committee</em><br/>
            that thinks in targets,<br/>
            not decks.
          </h1>
          <p className="lp-sub">
            Tell us what you'd buy and why. We return a working thesis and ten companies you could actually call Monday morning.
          </p>
          <form className="lp-form" onSubmit={submit}>
            <input
              autoFocus
              placeholder="you@fund.com"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit">Begin</button>
          </form>
          <div className="lp-meta">
            <div className="lp-meta-cell">
              <div className="lbl">Flat fee</div>
              <div className="val">$2,500 / thesis</div>
            </div>
            <div className="lp-meta-cell">
              <div className="lbl">Turnaround</div>
              <div className="val">~4 minutes</div>
            </div>
          </div>
        </div>
        <div className="lp-side">
          <div className="lp-side-eye">From a recent session</div>
          <p className="lp-quote">
            "I came in thinking 'pest control rollup.' I left with a sharper thesis and two names I had never heard of. One responded within a week."
          </p>
          <div className="lp-attr">— Searcher, Atlanta · $8M committed</div>
        </div>
      </div>
      <div className="lp-foot">
        <div>Built for independent searchers & ETA funds</div>
        <div>Press · Ethos · Login</div>
      </div>
    </div>
  );
}
