'use client';

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { reducer } from '@/lib/flow/reducer';
import { INITIAL_STATE, type FlowState, type FlowAction } from '@/lib/flow/types';

const LS_KEY = 'searcher.flow.v1';

interface FlowContextValue {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

const FlowContext = createContext<FlowContextValue | null>(null);

function loadInitial(): FlowState {
  if (typeof window === 'undefined') return INITIAL_STATE;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw);
    return { ...INITIAL_STATE, ...parsed };
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
