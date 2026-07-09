import type { SearchCriteria } from '@/lib/types';
import type { Archetype, Buckets, Facts } from '@/lib/flow/types';
import { parseLocation } from '@/lib/geo';

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

function deriveIndustry(buckets: Buckets): string {
  // The opening bucket is the authoritative industry signal — if present, use it.
  // Stickiness/archetype describe moat shape, not industry, so their keywords
  // should only be consulted when opening is missing entirely.
  const opening = buckets.opening?.trim();
  if (opening) return opening;

  const rest = [buckets.stickiness, buckets.archetype].filter(Boolean) as string[];
  const text = rest.join(' ').toLowerCase();
  for (const kw of INDUSTRY_KEYWORDS) {
    if (text.includes(kw)) {
      return rest.find((s) => s.toLowerCase().includes(kw)) ?? 'Business services';
    }
  }
  return 'Business services';
}

function deriveLocation(facts: Facts): SearchCriteria['location'] {
  // `Facts.geo` is either US-region quick-picks (["Southeast"], possibly several)
  // or free text ("Mumbai, India"). If the first entry is a known region chip,
  // keep the legacy behavior — resolve it to a representative metro (multi-region
  // selections use the first). Empty geo defaults to Southeast/Atlanta. Anything
  // else is a free-text location that parseLocation resolves to any country.
  const geo = facts.geo ?? [];
  const first = geo[0]?.trim();
  if (geo.length === 0 || (first && REGION_CAPITALS[first])) {
    const m = (first && REGION_CAPITALS[first]) || REGION_CAPITALS.Southeast;
    return { city: m.city, state: m.state, country: 'United States', radiusMiles: 50 };
  }
  return parseLocation(geo);
}

export function bucketsToCriteria(input: {
  archetype: Archetype | null;
  facts: Facts;
  buckets: Buckets;
}): SearchCriteria {
  const { facts, buckets, archetype } = input;
  const [rmin, rmax] = CHECK_TO_REV[facts.check ?? 'TBD'] ?? [null, null];
  // ETF and holdco have no direct slot in legacy searcherType; map to closest peer
  // so downstream ranker prompts pick the right tone.
  const searcherType: SearchCriteria['searcherType'] =
    archetype?.id === 'self-funded' ? 'self_funded' :
    archetype?.id === 'traditional' ? 'traditional' :
    archetype?.id === 'etf'         ? 'traditional' :
    archetype?.id === 'holdco'      ? 'self_funded' :
    archetype?.id === 'exploring'   ? 'aspiring' :
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
