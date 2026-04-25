// Ported from commit 3d1c701 (pre-wizard Sojo search UI).
// The pipeline only emits matchScore + matchReason; sub-scores are synthesized
// deterministically from lead signals so the bar viz stays stable across renders.

import type { RankedLead } from '@/lib/types';

export type Tier = 'a' | 'b' | 'c';

export const tierOf = (score: number): Tier =>
  score >= 85 ? 'a' : score >= 70 ? 'b' : 'c';

export const barCls = (v: number): 'h' | 'm' | 'l' =>
  v >= 85 ? 'h' : v >= 70 ? 'm' : 'l';

export interface SubScores {
  revenue: number;
  location: number;
  industry: number;
  signal: number;
}

export function subScoresFor(lead: RankedLead): SubScores {
  const base = lead.matchScore;
  const jitter = (seed: number, spread = 10) => {
    let h = 2166136261 ^ seed;
    h = Math.imul(h ^ (h >>> 13), 16777619);
    return ((h >>> 0) % (spread * 2 + 1)) - spread;
  };
  const seed = lead.id ? lead.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const rev = lead.businessDetails?.estimatedRevenue
    ? base + jitter(seed + 1, 6)
    : base - 6 + jitter(seed + 1, 4);
  const loc = base + jitter(seed + 2, 5);
  const ind = base + jitter(seed + 3, 7);
  const yrs = lead.businessDetails?.yearsInBusiness ?? 0;
  const reviews = lead.businessDetails?.reviewCount ?? 0;
  const signalBoost = Math.min(18, Math.floor(yrs / 2) + Math.floor(reviews / 30));
  const sig = Math.min(100, Math.max(30, base - 10 + signalBoost + jitter(seed + 4, 4)));
  const clamp = (n: number) => Math.min(100, Math.max(20, Math.round(n)));
  return { revenue: clamp(rev), location: clamp(loc), industry: clamp(ind), signal: sig };
}

export const locLine = (lead: RankedLead) =>
  [lead.city, lead.state].filter(Boolean).join(', ');

export const industryOf = (lead: RankedLead) =>
  lead.businessDetails?.categories?.[0] || 'Business';
