import { FlowState, FlowAction, INITIAL_STATE, Stage } from './types';

const clampStage = (n: number): Stage => Math.max(0, Math.min(7, n)) as Stage;

export function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, stage: clampStage(action.stage) };
    case 'SET_ARCHETYPE':
      return { ...state, archetype: action.archetype };
    case 'SET_FACTS':
      return { ...state, facts: { ...state.facts, ...action.facts } };
    case 'PATCH_BUCKETS':
      return { ...state, buckets: { ...state.buckets, ...action.patch } };
    case 'SET_THESIS':
      return { ...state, thesis: action.thesis };
    case 'START_SEARCH':
      return {
        ...state,
        jobId: action.jobId,
        searchError: null,
        leads: [],
        searchMetadata: null,
        searchProgress: null,
      };
    case 'UPDATE_PROGRESS':
      return { ...state, searchProgress: action.progress };
    case 'COMPLETE_SEARCH':
      return { ...state, leads: action.leads, searchMetadata: action.metadata };
    case 'FAIL_SEARCH':
      return { ...state, searchError: action.error };
    case 'SET_PROGRESS_MODE':
      return { ...state, progressMode: action.mode };
    case 'RESTART':
      return INITIAL_STATE;
    default:
      return state;
  }
}
