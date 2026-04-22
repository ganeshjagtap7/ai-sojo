import type { RankedLead, SearchCriteria } from '@/lib/types';

export type ArchetypeId = 'self-funded' | 'traditional' | 'etf' | 'holdco' | 'exploring';

export interface Archetype {
  id: ArchetypeId;
  name: string;
}

export type BucketKey =
  | 'opening'
  | 'stickiness'
  | 'archetype'
  | 'disqualifier'
  | 'concentration-nuance'
  | 'vision';

export type Buckets = Partial<Record<BucketKey, string>>;

export interface Facts {
  capital?: 'Self-funded' | 'Investor-backed' | 'Fund LP';
  check?: '< $1M' | '$1–3M' | '$3–10M' | '$10M+' | 'TBD';
  geo?: string[];
  horizon?: '3–5 yrs' | '5–10 yrs' | '10+ yrs (holdco)' | 'Unsure';
  role?: 'CEO, day one' | 'Chair, light-touch' | 'Board only';
}

export interface Thesis {
  paragraph: string;
  sharpening: string;
  disqualifiers: string[];
  headline: string;
  archetypeLabel: string;
  flag: string | null;
}

export interface SearchProgress {
  step: string;
  stepsCompleted: number;
  totalSteps: number;
  message?: string;
}

export interface SearchMetadataLite {
  totalScraped: number;
  afterDedup: number;
  afterFiltering: number;
  sourcesUsed: string[];
  searchDurationSeconds: number;
}

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FlowState {
  stage: Stage;
  archetype: Archetype | null;
  facts: Facts;
  buckets: Buckets;
  thesis: Thesis | null;
  jobId: string | null;
  progressMode: 'auto' | 'early' | 'mid' | 'done';
  searchProgress: SearchProgress | null;
  searchMetadata: SearchMetadataLite | null;
  leads: RankedLead[];
  searchError: string | null;
}

export const INITIAL_STATE: FlowState = {
  stage: 0,
  archetype: null,
  facts: {},
  buckets: {},
  thesis: null,
  jobId: null,
  progressMode: 'auto',
  searchProgress: null,
  searchMetadata: null,
  leads: [],
  searchError: null,
};

export type FlowAction =
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'SET_ARCHETYPE'; archetype: Archetype }
  | { type: 'SET_FACTS'; facts: Facts }
  | { type: 'PATCH_BUCKETS'; patch: Buckets }
  | { type: 'SET_THESIS'; thesis: Thesis }
  | { type: 'START_SEARCH'; jobId: string }
  | { type: 'UPDATE_PROGRESS'; progress: SearchProgress }
  | { type: 'COMPLETE_SEARCH'; leads: RankedLead[]; metadata: SearchMetadataLite }
  | { type: 'FAIL_SEARCH'; error: string }
  | { type: 'SET_PROGRESS_MODE'; mode: FlowState['progressMode'] }
  | { type: 'RESTART' };

export type { SearchCriteria };
