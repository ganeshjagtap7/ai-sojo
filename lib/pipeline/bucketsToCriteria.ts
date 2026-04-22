import type { SearchCriteria } from '@/lib/types';
import type { Archetype, Buckets, Facts } from '@/lib/flow/types';

const REGION_CAPITALS: Record<string, { city: string; state: string }> = {
  Southeast: { city: 'Atlanta', state: 'GA' },
  Midwest: { city: 'Chicago', state: 'IL' },
  Texas: { city: 'Dallas', state: 'TX' },
  'Mountain West': { city: 'Denver', state: 'CO' },
  Northeast: { city: 'Boston', state: 'MA' },
  Open: { city: 'Atlanta', state: 'GA' },
};

const CHECK_TO_REV: Record<string, [number | null, number | null]> = {
  '< $1M': [null, 1_000_000],
  '$1–3M': [1_000_000, 3_000_000],
  '$3–10M': [3_000_000, 10_000_000],
  '$10M+': [10_000_000, null],
  TBD: [null, null],
};

const INDUSTRY_KEYWORDS = [
  'plumb', 'hvac', 'electric', 'roofing', 'landscap', 'pest', 'fire', 'elevator',
  'water treatment', 'pump', 'grease', 'crane', 'filter', 'generator', 'manufactur',
  'services', 'repair', 'install', 'supply', 'distribution',
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveIndustry(buckets: Buckets): string {
  const sources = [buckets.opening, buckets.stickiness, buckets.archetype].filter(Boolean) as string[];
  const text = sources.join(' ').toLowerCase();
  for (const kw of INDUSTRY_KEYWORDS) {
    if (text.includes(kw)) {
      return sources.find((s) => s.toLowerCase().includes(kw)) ?? capitalize(kw);
    }
  }
  return buckets.opening ?? 'Business services';
}

function deriveLocation(facts: Facts): { city: string; state: string; country: 'US'; radiusMiles: number } {
  const region = facts.geo?.[0];
  const match = region ? REGION_CAPITALS[region] : REGION_CAPITALS.Southeast;
  return {
    city: match.city,
    state: match.state,
    country: 'US',
    radiusMiles: 50,
  };
}

export function bucketsToCriteria(input: {
  archetype: Archetype | null;
  facts: Facts;
  buckets: Buckets;
}): SearchCriteria {
  const { facts, buckets, archetype } = input;
  const [rmin, rmax] = CHECK_TO_REV[facts.check ?? 'TBD'] ?? [null, null];
  const searcherType: SearchCriteria['searcherType'] =
    archetype?.id === 'self-funded' ? 'self_funded' :
    archetype?.id === 'traditional' ? 'traditional' :
    archetype?.id === 'exploring' ? 'aspiring' :
    'unknown';

  return {
    location: deriveLocation(facts),
    industry: {
      primary: deriveIndustry(buckets),
      subSectors: [],
      keywords: [buckets.stickiness, buckets.archetype].filter(Boolean) as string[],
    },
    businessSize: {
      revenueMin: rmin,
      revenueMax: rmax,
      employeeMin: null,
      employeeMax: null,
    },
    preferences: {
      businessAgeYears: null,
      ownerOperated: null,
      disqualifiers: buckets.disqualifier ? [buckets.disqualifier] : [],
    },
    searcherType,
  };
}
