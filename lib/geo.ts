// Deterministic location parsing for international search — no LLM.
//
// The wizard captures location as free text (comma-split into `facts.geo`), e.g.
// "Mumbai, India" → ["Mumbai", "India"]. This module turns those parts into a
// { city, state, country, radiusMiles } shape, detecting the country so the
// source router (isUS / isIndia / isCanada) can pick the right scrapers.
//
// Design: the last segment is resolved against a country table (with aliases)
// and a US-state set. A US state → US search. A known/plausible country → that
// country. Otherwise we fall back to a US city (legacy behavior). Countries not
// in the table still route as long as they appear as the last segment — Google
// Maps + web search are global, so unknown countries degrade gracefully.

export interface ParsedLocation {
  city: string;
  state: string;
  country: string;
  radiusMiles: number;
}

// Canonical display name + ISO-3166 alpha-2 (used by the web-search scraper's
// countryCode) + spelling/abbreviation aliases. Common countries only; any
// other named country is still accepted (see parseLocation), just without a
// code mapping.
const COUNTRIES: { display: string; code: string; aliases: string[] }[] = [
  { display: 'United States', code: 'us', aliases: ['united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'u.s.a', 'america'] },
  { display: 'India', code: 'in', aliases: ['india', 'bharat'] },
  { display: 'Canada', code: 'ca', aliases: ['canada'] },
  { display: 'United Kingdom', code: 'gb', aliases: ['united kingdom', 'uk', 'u.k.', 'britain', 'great britain', 'england', 'scotland', 'wales'] },
  { display: 'Australia', code: 'au', aliases: ['australia'] },
  { display: 'United Arab Emirates', code: 'ae', aliases: ['united arab emirates', 'uae'] },
  { display: 'Singapore', code: 'sg', aliases: ['singapore'] },
  { display: 'Germany', code: 'de', aliases: ['germany', 'deutschland'] },
  { display: 'France', code: 'fr', aliases: ['france'] },
  { display: 'Spain', code: 'es', aliases: ['spain'] },
  { display: 'Italy', code: 'it', aliases: ['italy'] },
  { display: 'Netherlands', code: 'nl', aliases: ['netherlands', 'holland'] },
  { display: 'Ireland', code: 'ie', aliases: ['ireland'] },
  { display: 'New Zealand', code: 'nz', aliases: ['new zealand'] },
  { display: 'South Africa', code: 'za', aliases: ['south africa'] },
  { display: 'Mexico', code: 'mx', aliases: ['mexico', 'méxico'] },
  { display: 'Brazil', code: 'br', aliases: ['brazil', 'brasil'] },
  { display: 'Japan', code: 'jp', aliases: ['japan'] },
  { display: 'Philippines', code: 'ph', aliases: ['philippines'] },
  { display: 'Pakistan', code: 'pk', aliases: ['pakistan'] },
  { display: 'Bangladesh', code: 'bd', aliases: ['bangladesh'] },
  { display: 'Nigeria', code: 'ng', aliases: ['nigeria'] },
  { display: 'Kenya', code: 'ke', aliases: ['kenya'] },
  { display: 'Saudi Arabia', code: 'sa', aliases: ['saudi arabia', 'ksa'] },
];

// US states (full name + USPS code) so "Austin, Texas" stays a US search and the
// last segment isn't mistaken for a foreign country.
const US_STATES = new Set<string>([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming', 'district of columbia',
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in',
  'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv',
  'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn',
  'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc',
]);

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// USPS code → lowercase full state name, for sources that filter by state name
// (e.g. BizBuySell's actor expects location="texas", not "TX").
const US_STATE_NAMES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado',
  ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho',
  il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana',
  me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota',
  ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada',
  nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina',
  nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas',
  ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia',
  wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia',
};

/** Lowercase full US state name from a 2-letter code or a full name; null if empty. */
export function usStateSlug(state: string | null | undefined): string | null {
  if (!state) return null;
  const s = state.trim().toLowerCase();
  if (s.length === 2) return US_STATE_NAMES[s] ?? null;
  return s; // already a name (or free text) — pass through lowercased
}

function resolveCountry(segment: string): { display: string; code: string } | null {
  const lc = segment.trim().toLowerCase();
  const hit = COUNTRIES.find((c) => c.aliases.includes(lc));
  return hit ? { display: hit.display, code: hit.code } : null;
}

/** ISO-3166 alpha-2 for a country display name (as stored on criteria.location).
 *  Empty string when unknown — callers fall back to their own default. */
export function countryCodeOf(country: string | null | undefined): string {
  if (!country) return '';
  return resolveCountry(country)?.code ?? '';
}

/** True for US / empty (treated as US) countries. Mirrors the router's isUS. */
export function isUSCountry(country: string | null | undefined): boolean {
  const c = (country ?? '').trim().toLowerCase();
  return c === '' || resolveCountry(c)?.code === 'us';
}

/**
 * Parse comma-split location parts (e.g. ["Mumbai", "India"]) into a location.
 * `usRegionFallback` supplies a {city,state} for a single US-region quick-pick
 * (Southeast, Texas, …) that the caller recognizes; parseLocation itself is
 * region-agnostic so it stays a pure, testable function.
 */
export function parseLocation(
  parts: string[],
  usRegionFallback?: { city: string; state: string } | null,
): ParsedLocation {
  const clean = parts
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean);

  // Nothing usable → default US city from the fallback (or empty US).
  if (clean.length === 0) {
    return { city: usRegionFallback?.city ?? '', state: usRegionFallback?.state ?? '', country: 'United States', radiusMiles: 50 };
  }

  // Single token that the caller mapped to a US region quick-pick.
  if (clean.length === 1 && usRegionFallback) {
    return { city: usRegionFallback.city, state: usRegionFallback.state, country: 'United States', radiusMiles: 50 };
  }

  const last = clean[clean.length - 1];
  const lastLc = last.toLowerCase();

  // "Austin, Texas" / "Austin, TX" → US search, last segment is a state.
  if (US_STATES.has(lastLc)) {
    return {
      city: titleCase(clean[0]),
      state: last.length === 2 ? last.toUpperCase() : titleCase(last),
      country: 'United States',
      radiusMiles: 50,
    };
  }

  // Known country as the last segment → international with a canonical name.
  const known = resolveCountry(last);
  if (known) {
    return {
      city: clean.length >= 2 ? titleCase(clean[0]) : '',
      state: clean.length >= 3 ? titleCase(clean[1]) : '',
      country: known.display,
      radiusMiles: 50,
    };
  }

  // Two+ segments, last isn't a US state or a known country → treat it as a
  // foreign country we simply don't have in the table (still routes globally).
  if (clean.length >= 2) {
    return {
      city: titleCase(clean[0]),
      state: clean.length >= 3 ? titleCase(clean[1]) : '',
      country: titleCase(last),
      radiusMiles: 50,
    };
  }

  // Single free-form token, no country/region signal → assume a US city.
  return { city: titleCase(clean[0]), state: '', country: 'United States', radiusMiles: 50 };
}
