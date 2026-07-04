/** US state abbreviation → full lowercase name, for building location slugs
 *  on sites that use names in URLs (e.g. businessesforsale.com). */
const US_STATES: Record<string, string> = {
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

/** "GA" → "georgia"; already-full names pass through lowercased; unknown → ''. */
export function stateFullName(state: string): string {
  const s = state.trim();
  if (!s) return '';
  const byAbbrev = US_STATES[s.toUpperCase()];
  if (byAbbrev) return byAbbrev;
  const lower = s.toLowerCase();
  return Object.values(US_STATES).includes(lower) ? lower : '';
}
