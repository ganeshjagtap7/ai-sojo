'use client';

import { createContext, useContext, useEffect, useReducer, useState, type Dispatch, type ReactNode } from 'react';
import { reducer } from '@/lib/flow/reducer';
import { INITIAL_STATE, type FlowState, type FlowAction, type Stage } from '@/lib/flow/types';

export const LS_KEY = 'searcher.flow.v1';

interface FlowContextValue {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

const FlowContext = createContext<FlowContextValue | null>(null);
FlowContext.displayName = 'FlowContext';

// Clear non-persistent fields on reload. `progressMode` is a dev-only override
// (set from the TweaksPanel) — it must never survive a reload: a persisted
// non-'auto' value makes Stage5 skip real thesis generation and jump straight
// to "done". Always reset it to 'auto' on load.
function resetTransient(s: FlowState): FlowState {
  return { ...s, progressMode: 'auto' };
}

function sanitize(parsed: unknown): FlowState {
  if (!parsed || typeof parsed !== 'object') return INITIAL_STATE;
  const p = parsed as Partial<FlowState>;
  const stageNum = typeof p.stage === 'number' ? Math.max(0, Math.min(6, p.stage)) : 0;
  return {
    ...INITIAL_STATE,
    ...p,
    stage: stageNum as Stage,
    facts: p.facts && typeof p.facts === 'object' ? p.facts : {},
    buckets: p.buckets && typeof p.buckets === 'object' ? p.buckets : {},
    leads: Array.isArray(p.leads) ? p.leads : [],
    convo: Array.isArray(p.convo) ? p.convo : [],
  };
}

function loadInitial(): FlowState {
  if (typeof window === 'undefined') return INITIAL_STATE;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return INITIAL_STATE;
    return resetTransient(sanitize(JSON.parse(raw)));
  } catch {
    return INITIAL_STATE;
  }
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE, loadInitial);
  // Server renders with INITIAL_STATE; client's lazy init reads localStorage.
  // Gate children until after mount so the server HTML (empty) matches the client's
  // first render, avoiding a hydration mismatch when persisted state exists.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // quota / private mode — ignore
    }
  }, [state]);

  if (!mounted) return null;

  return <FlowContext.Provider value={{ state, dispatch }}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used inside <FlowProvider>');
  return ctx;
}
