'use client';

import { useEffect, useState } from 'react';
import { useFlow } from './FlowProvider';

const STAGE_IDS = [0, 1, 2, 3, 4, 5, 6] as const;

export function TweaksPanel() {
  const { state, dispatch } = useFlow();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEnabled(new URLSearchParams(window.location.search).has('tweaks'));
  }, []);

  if (!enabled) return null;

  return (
    <div className="tweaks show">
      <div className="tweaks-h">
        <span>Tweaks</span>
        <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
          dev · jump + tune
        </span>
      </div>

      <div className="tweak-sec">
        <label className="tweak-l">Jump to stage</label>
        <div className="tweak-opts four">
          {STAGE_IDS.slice(0, 4).map((s) => (
            <button key={s} className={`tweak-b ${state.stage === s ? 'on' : ''}`} onClick={() => dispatch({ type: 'SET_STAGE', stage: s })}>
              {String(s).padStart(2, '0')}
            </button>
          ))}
        </div>
        <div className="tweak-opts four" style={{ marginTop: 4 }}>
          {STAGE_IDS.slice(4).map((s) => (
            <button key={s} className={`tweak-b ${state.stage === s ? 'on' : ''}`} onClick={() => dispatch({ type: 'SET_STAGE', stage: s })}>
              {String(s).padStart(2, '0')}
            </button>
          ))}
        </div>
      </div>

      {state.stage === 5 && (
        <div className="tweak-sec">
          <label className="tweak-l">Generation phase</label>
          <div className="tweak-opts four">
            {(['auto', 'early', 'mid', 'done'] as const).map((m) => (
              <button key={m} className={`tweak-b ${state.progressMode === m ? 'on' : ''}`} onClick={() => dispatch({ type: 'SET_PROGRESS_MODE', mode: m })}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tweak-sec">
        <button className="tweak-b" style={{ width: '100%' }} onClick={() => dispatch({ type: 'RESTART' })}>
          ↻ Reset all state
        </button>
      </div>
    </div>
  );
}
