'use client';

import { useState } from 'react';
import { useFlow } from './FlowProvider';
import type { ArchetypeId } from '@/lib/flow/types';

// Stage 1: archetype + name
export function Stage1Identify() {
  const { dispatch } = useFlow();
  const [selected, setSelected] = useState<ArchetypeId | null>(null);
  const [name, setName] = useState('');
  const archetypes = [
    { id: 'self-funded', t: "Self-funded searcher", m: "One shot. One check. Everything on the line." },
    { id: 'traditional', t: "Traditional searcher with investors", m: "Committee-backed. Reputation matters." },
    { id: 'etf',         t: "Fundless sponsor / ETA fund", m: "Portfolio mindset. Pattern over precision." },
    { id: 'holdco',      t: "Holdco operator", m: "Long hold. Platform-shaped thinking." },
    { id: 'exploring',   t: "Still exploring — not sure yet", m: "The system will push a little harder." },
  ];
  // A real name is letters only (plus spaces, hyphens, apostrophes, periods for
  // names like "O'Brien", "Jean-Luc", "Dr. Rao"). No digits at all — blocks
  // "67289", "3434hfh", etc.
  const nameValid = name.trim().length >= 2 && /^[\p{L}][\p{L} .'-]*$/u.test(name.trim());
  const nameError = name.trim().length > 0 && !nameValid;
  const ready = selected && nameValid;
  const go = () => {
    if (!ready || !selected) return;
    dispatch({ type: 'SET_ARCHETYPE', archetype: { id: selected, name: name.trim() } });
    dispatch({ type: 'SET_STAGE', stage: 2 });
  };
  return (
    <div className="identify fade-in">
      <div className="identify-inner">
        <div className="iden-eye">§ One · Identify</div>
        <h2 className="iden-q">Who's <em>searching</em>?</h2>
        <p className="iden-help">We tune the entire session to your archetype — how hard we push back, what disqualifiers matter, how we frame risk.</p>
        <div className="iden-cards">
          {archetypes.map((a, i) => (
            <div key={a.id}
                 className={`iden-card ${selected === a.id ? 'selected' : ''}`}
                 onClick={() => setSelected(a.id as ArchetypeId)}>
              <div className="iden-card-num">{String(i+1).padStart(2,'0')}</div>
              <div className="iden-card-body">
                <div className="t">{a.t}</div>
                <div className="m">{a.m}</div>
              </div>
              <div className="iden-card-arrow">→</div>
            </div>
          ))}
        </div>
        <div className="iden-name">
          <div>
            <div className="iden-name-label">And your name, for the record</div>
            <input
              type="text"
              placeholder="Full name"
              aria-invalid={nameError}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
            {nameError && (
              <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--danger, #991b1b)', marginTop: 4 }}>
                Please enter your name
              </div>
            )}
          </div>
          <button className="iden-cta" disabled={!ready} onClick={go}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
