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

export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface FlowState {
  stage: Stage;
  // Email captured on the Stage 0 landing form (gates "Begin"). Persisted so it
  // isn't collected-then-discarded and is available downstream (e.g. to pre-fill
  // signup) instead of being thrown away.
  email: string | null;
  archetype: Archetype | null;
  facts: Facts;
  buckets: Buckets;
  thesis: Thesis | null;
  progressMode: 'auto' | 'early' | 'mid' | 'done';
  leads: RankedLead[];
}

export const INITIAL_STATE: FlowState = {
  stage: 0,
  email: null,
  archetype: null,
  facts: {},
  buckets: {},
  thesis: null,
  progressMode: 'auto',
  leads: [],
};

export type FlowAction =
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_ARCHETYPE'; archetype: Archetype }
  | { type: 'SET_FACTS'; facts: Facts }
  | { type: 'PATCH_BUCKETS'; patch: Buckets }
  | { type: 'SET_THESIS'; thesis: Thesis }
  | { type: 'SET_PROGRESS_MODE'; mode: FlowState['progressMode'] }
  | { type: 'RESTART' };

export type { SearchCriteria };
