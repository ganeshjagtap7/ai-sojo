'use client';

import { useState } from 'react';
import { useFlow } from './FlowProvider';
import type { Facts } from '@/lib/flow/types';

// Stage 2: fast facts
const FACT_FIELDS = [
  {
    id: 'capital',
    label: 'Capital shape',
    sub: 'pick one',
    kind: 'pick',
    options: ['Self-funded', 'Investor-backed', 'Fund LP'],
  },
  {
    id: 'check',
    label: 'Equity you can write',
    sub: 'approximate',
    kind: 'pick',
    options: ['< $1M', '$1–3M', '$3–10M', '$10M+', 'TBD'],
  },
  {
    id: 'geo',
    label: 'Where you will actually go',
    sub: 'pick any — or type a city / country',
    kind: 'multi',
    options: ['Southeast', 'Midwest', 'Texas', 'Mountain West', 'Northeast', 'Open'],
  },
  {
    id: 'horizon',
    label: 'Hold horizon',
    sub: 'rough',
    kind: 'pick',
    options: ['3–5 yrs', '5–10 yrs', '10+ yrs (holdco)', 'Unsure'],
  },
  {
    id: 'role',
    label: 'What you want to actually do',
    sub: 'the day-to-day',
    kind: 'pick',
    options: ['CEO, day one', 'Chair, light-touch', 'Board only'],
  },
];

export function Stage2Facts() {
  const { state, dispatch } = useFlow();
  const { facts } = state;
  const update = (id: keyof Facts, val: Facts[keyof Facts]) =>
    dispatch({ type: 'SET_FACTS', facts: { [id]: val } as Facts });
  const toggleMulti = (id: keyof Facts, val: string) => {
    const cur = (facts[id] as string[] | undefined) || [];
    if (cur.includes(val)) update(id, cur.filter(x => x !== val) as Facts[keyof Facts]);
    else update(id, [...cur, val] as Facts[keyof Facts]);
  };
  // Free-text location (any city / country) — added to the geo multi-select as a
  // removable chip, so international searches aren't limited to the US regions.
  const [customGeo, setCustomGeo] = useState('');
  const addGeo = (val: string) => {
    const t = val.trim();
    if (!t) return;
    const cur = (facts.geo as string[] | undefined) || [];
    if (!cur.some((g) => g.toLowerCase() === t.toLowerCase())) {
      update('geo', [...cur, t] as Facts[keyof Facts]);
    }
    setCustomGeo('');
  };
  const answered = FACT_FIELDS.filter(f => {
    const v = facts[f.id as keyof Facts];
    return Array.isArray(v) ? v.length : v;
  }).length;

  return (
    <div className="facts fade-in">
      <div className="facts-inner">
        <div className="facts-eye">§ Two · Fast facts</div>
        <h2 className="facts-motto">
          Five answers, <em>one minute</em>.<br/>
          No wrong answers. Skip anything you'd rather talk through.
        </h2>
        {FACT_FIELDS.map(f => {
          const v = facts[f.id as keyof Facts];
          return (
            <div className="fact-row" key={f.id}>
              <div className="fact-label">
                {f.label}
                <span className="sub">· {f.sub}</span>
              </div>
              {f.kind === 'pick' && (
                <div className="pill-row">
                  {f.options.map(o => (
                    <button key={o}
                      className={`pill ${v === o ? 'on' : ''}`}
                      onClick={() => update(f.id as keyof Facts, (v === o ? null : o) as Facts[keyof Facts])}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {f.kind === 'multi' && (
                <div className="pill-row">
                  {/* Preset options plus any free-typed values, so custom
                      locations show as removable chips alongside the presets. */}
                  {[...f.options, ...((v as string[] | undefined) || []).filter((o) => !f.options.includes(o))].map(o => (
                    <button key={o}
                      className={`pill ${((v as string[] | undefined)||[]).includes(o) ? 'on' : ''}`}
                      onClick={() => toggleMulti(f.id as keyof Facts, o)}>
                      {o}
                    </button>
                  ))}
                  {f.id === 'geo' && (
                    <input
                      className="pill-input"
                      type="text"
                      placeholder="+ city / country, e.g. Mumbai, India"
                      value={customGeo}
                      onChange={(e) => setCustomGeo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addGeo(customGeo); }
                      }}
                      onBlur={() => addGeo(customGeo)}
                      style={{
                        border: '1px dashed var(--border)', background: 'transparent',
                        borderRadius: 999, padding: '6px 14px', fontSize: 13,
                        color: 'inherit', minWidth: 220, outline: 'none',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button className="skip-link" onClick={() => dispatch({ type: 'SET_STAGE', stage: 3 })}>I'd rather just talk — skip the form</button>

        <div className="facts-foot">
          <div className="facts-count">{answered} of {FACT_FIELDS.length} answered</div>
          <button className="iden-cta" onClick={() => dispatch({ type: 'SET_STAGE', stage: 3 })}>
            Start the conversation →
          </button>
        </div>
      </div>
    </div>
  );
}
