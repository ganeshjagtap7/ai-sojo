'use client';

import { useEffect, useRef, useState } from 'react';
import { useFlow } from './FlowProvider';

const LANE_STEPS = [
  { n: 'i. Thesis synthesis', items: [
    'Reading session transcript',
    'Extracting hard disqualifiers',
    'Reconciling facts with conversation',
    'Drafting the one-paragraph thesis',
    'Stress-testing against archetype',
  ] },
];

export function Stage5Generate() {
  const { state, dispatch } = useFlow();
  const { buckets, facts, archetype, progressMode } = state;
  const [thesisProgress, setThesisProgress] = useState(0);
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
    if (progressMode === 'done') { setReady(true); setThesisProgress(5); }
    else if (progressMode === 'mid') { setThesisProgress(3); }
    else if (progressMode === 'early') { setThesisProgress(1); }
  }, [progressMode]);

  // Kick off thesis on mount (auto mode only). Deal search has moved to Surface 3 (/app).
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

    return () => clearInterval(thesisTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (thesisProgress >= 5) setReady(true);
  }, [thesisProgress]);

  const laneState = (laneIdx: number, itemIdx: number): 'pending' | 'active' | 'done' => {
    if (laneIdx === 0) {
      if (itemIdx < thesisProgress) return 'done';
      if (itemIdx === thesisProgress && thesisProgress < 5) return 'active';
      return 'pending';
    }
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
            </div>
          )}

          {ready && (
            <div className="s5-ready-card">
              <div className="t">Done. Your thesis is ready.</div>
              <button onClick={() => dispatch({ type: 'SET_STAGE', stage: 6 })}>Open the deliverable →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
