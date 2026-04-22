'use client';

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { reducer } from '@/lib/flow/reducer';
import { INITIAL_STATE, type FlowState, type FlowAction, type Stage } from '@/lib/flow/types';

export const LS_KEY = 'searcher.flow.v1';

interface FlowContextValue {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

const FlowContext = createContext<FlowContextValue | null>(null);
FlowContext.displayName = 'FlowContext';

// Fields that shouldn't survive a page refresh — a stale jobId points at a stream the server has dropped.
function resetTransient(s: FlowState): FlowState {
  return { ...s, jobId: null, searchProgress: null, searchError: null };
}

function sanitize(parsed: unknown): FlowState {
  if (!parsed || typeof parsed !== 'object') return INITIAL_STATE;
  const p = parsed as Partial<FlowState>;
  const stageNum = typeof p.stage === 'number' ? Math.max(0, Math.min(7, p.stage)) : 0;
  return {
    ...INITIAL_STATE,
    ...p,
    stage: stageNum as Stage,
    facts: p.facts && typeof p.facts === 'object' ? p.facts : {},
    buckets: p.buckets && typeof p.buckets === 'object' ? p.buckets : {},
    leads: Array.isArray(p.leads) ? p.leads : [],
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // quota / private mode — ignore
    }
  }, [state]);

  return <FlowContext.Provider value={{ state, dispatch }}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used inside <FlowProvider>');
  return ctx;
}
