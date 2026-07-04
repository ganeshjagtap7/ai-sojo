// US state code → full name (lowercase), shared by criteria-aware scrapers that
// build location search URLs (e.g. businessesforsale "…-in-georgia"). Accepts
// either a 2-letter code ("GA") or a full name ("Georgia") and normalizes to the
// lowercase full name ("georgia"); returns '' for anything it can't resolve.

export const US_STATES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey',
  NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio',
  OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina',
  SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont',
  VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming',
  DC: 'district of columbia',
};

const FULL_NAMES = new Set(Object.values(US_STATES));

/** "GA" → "georgia", "Georgia" → "georgia", "" / unknown → "". */
export function stateFullName(input: string | null | undefined): string {
  const s = (input || '').trim();
  if (!s) return '';
  const code = s.toUpperCase();
  if (US_STATES[code]) return US_STATES[code];
  const lower = s.toLowerCase();
  return FULL_NAMES.has(lower) ? lower : '';
}
