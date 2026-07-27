'use client';

import { useEffect, useState } from 'react';
import { useFlow } from './FlowProvider';
import type { Facts } from '@/lib/flow/types';

export function Stage4Confirm() {
  const { state, dispatch } = useFlow();
  const { buckets, facts } = state;

  const thesisParts = {
    arche: buckets['archetype'] || 'A searcher-sized business',
    stickiness: buckets['stickiness'] || 'meaningful switching cost',
    disqualifier: buckets['disqualifier'] || 'customer concentration above 40%',
    nuance: buckets['concentration-nuance'] || 'unless tenured and meetable',
    vision: buckets['vision'] || 'compounded, calm, worth running',
    geo: (facts.geo || ['Southeast']).join(', '),
    check: facts.check || '$3–10M',
    horizon: facts.horizon || '5–10 yrs',
    role: facts.role || 'CEO, day one',
  };

  return (
    <div className="confirm fade-in">
      <div className="confirm-inner">
        <div className="confirm-eye">§ Four · Confirm the thesis</div>

        <div className="confirm-thesis">
          <p>
            You are looking for{' '}
            <Editable
              value={thesisParts.arche}
              render={(v) => v.toLowerCase()}
              onCommit={(v) => dispatch({ type: 'PATCH_BUCKETS', patch: { archetype: v } })}
            />{' '}
            in{' '}
            <Editable
              value={thesisParts.geo}
              onCommit={(v) =>
                dispatch({
                  type: 'SET_FACTS',
                  facts: { geo: v.split(',').map((s) => s.trim()).filter(Boolean) },
                })
              }
            />
            , writing{' '}
            <Editable
              value={thesisParts.check}
              onCommit={(v) => dispatch({ type: 'SET_FACTS', facts: { check: v as Facts['check'] } })}
            />{' '}
            of equity with a{' '}
            <Editable
              value={thesisParts.horizon}
              onCommit={(v) => dispatch({ type: 'SET_FACTS', facts: { horizon: v as Facts['horizon'] } })}
            />{' '}
            horizon.
          </p>
          <p>
            The moat you care about is{' '}
            <Editable
              value={thesisParts.stickiness}
              onCommit={(v) => dispatch({ type: 'PATCH_BUCKETS', patch: { stickiness: v } })}
            />
            . You walk away if{' '}
            <Editable
              value={thesisParts.disqualifier}
              onCommit={(v) => dispatch({ type: 'PATCH_BUCKETS', patch: { disqualifier: v } })}
            />{' '}
            — <em>but</em> you'll entertain{' '}
            <Editable
              value={thesisParts.nuance}
              onCommit={(v) => dispatch({ type: 'PATCH_BUCKETS', patch: { 'concentration-nuance': v } })}
            />
            .
          </p>
          <p className="dim">
            Five years from now, this looks like:{' '}
            <Editable
              value={thesisParts.vision}
              onCommit={(v) => dispatch({ type: 'PATCH_BUCKETS', patch: { vision: v } })}
            />{' '}
            — with you as{' '}
            <Editable
              value={thesisParts.role}
              render={(v) => v.toLowerCase()}
              onCommit={(v) => dispatch({ type: 'SET_FACTS', facts: { role: v as Facts['role'] } })}
            />
            .
          </p>
        </div>

        <div className="confirm-actions">
          <button
            className="confirm-btn primary"
            onClick={() => dispatch({ type: 'SET_STAGE', stage: 5 })}
          >
            That's it — build it
          </button>
          <button
            className="confirm-btn ghost"
            onClick={() => dispatch({ type: 'SET_STAGE', stage: 3 })}
          >
            Back · revise
          </button>
        </div>
        <div className="confirm-note">
          Hover or tap any phrase to edit. Nothing is sent until you click build.
        </div>
      </div>
    </div>
  );
}

function Editable({
  value,
  onCommit,
  render,
}: {
  value: string;
  onCommit: (v: string) => void;
  render?: (v: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) {
    return (
      <span className="editable" onClick={() => setEditing(true)}>
        {render ? render(value) : value}
      </span>
    );
  }
  const commit = () => {
    const next = v.trim() || value;
    // If nothing actually changed (or the field was cleared back to the shown
    // value), don't write it. `value` is often a placeholder default for a
    // skipped bucket — committing it on a bare click+blur would harden that
    // placeholder into real thesis state, breaking "Nothing is sent until build".
    if (next === value) {
      setEditing(false);
      return;
    }
    onCommit(next);
    setEditing(false);
  };
  return (
    <input
      autoFocus
      className="editable-input"
      size={Math.max(v.length + 1, 6)}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEditing(false);
          setV(value);
        }
      }}
    />
  );
}
