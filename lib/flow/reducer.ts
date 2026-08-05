import { FlowState, FlowAction, INITIAL_STATE, Stage } from './types';

const clampStage = (n: number): Stage => Math.max(0, Math.min(6, n)) as Stage;

export function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, stage: clampStage(action.stage) };
    case 'SET_EMAIL':
      return { ...state, email: action.email };
    case 'SET_CONVO':
      return { ...state, convo: action.convo };
    case 'SET_ARCHETYPE':
      return { ...state, archetype: action.archetype };
    case 'SET_FACTS':
      return { ...state, facts: { ...state.facts, ...action.facts } };
    case 'PATCH_BUCKETS':
      return { ...state, buckets: { ...state.buckets, ...action.patch } };
    case 'SET_THESIS':
      return { ...state, thesis: action.thesis };
    case 'SET_PROGRESS_MODE':
      return { ...state, progressMode: action.mode };
    case 'RESTART':
      return INITIAL_STATE;
    default:
      return state;
  }
}
