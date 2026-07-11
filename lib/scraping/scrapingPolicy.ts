/**
 * Scraping policy — the single source of truth for how this app scrapes.
 *
 * Every scraper wired into the production pipeline (`lib/pipeline/
 * searchPipeline.ts`) routes through this module, so our conduct is enforced in
 * one place rather than re-stated (and drifting) per scraper. The local-only
 * Phase-1 deal scrapers (`apppeak` / `quietlight` / `startupage`) are
 * deliberately NOT covered here: they run as standalone dev scripts (never on
 * Vercel) and some authenticate to the site (e.g. `startupage` reuses a saved
 * login session), so they are not public, logged-out sources and must never be
 * added to the allowlist below. It codifies two principles:
 *
 *  (a) Logged-out / public-only. We only ever collect data that is publicly
 *      visible WITHOUT authenticating to any site — no logins, no accounts,
 *      no auth-walled or private data. Each registered source below is a
 *      public, logged-out source. `assertPublicSource` is the gate: a scraper
 *      whose source isn't on the allowlist must not run.
 *
 *  (b) Conservative rate. We cap how aggressively we hit each source so we
 *      behave like polite traffic. `cappedMaxResults` clamps the per-scraper
 *      result count to a conservative ceiling (env-tunable, hard-defaulted),
 *      and `MAX_CONCURRENT_REQUESTS_PER_SOURCE` / `MIN_REQUEST_SPACING_MS`
 *      document the politeness budget for callers that need it.
 */

/** The `source` literal each scraper stamps onto its RawLead output. */
export type ScrapingSource =
  | 'google_maps'
  | 'web_search'
  | 'bbb'
  | 'yellowpages'
  | 'manta'
  | 'bizbuysell'
  | 'flippa'
  | 'acquire';

/** Static description of one registered, public, logged-out source. */
export interface PublicSourcePolicy {
  /** The RawLead `source` literal — also the allowlist key. */
  source: ScrapingSource;
  /** Human label for logs / errors. */
  label: string;
  /**
   * Always true here: this manifest only ever lists public, logged-out
   * sources. The flag is explicit so the invariant is greppable and any
   * future addition has to consciously affirm it.
   */
  loggedOut: true;
}

/**
 * The public-source allowlist. Adding a source here is an assertion that it is
 * scraped logged-out, from publicly visible pages only. Anything not listed
 * here is rejected by `assertPublicSource`.
 */
export const PUBLIC_SOURCES: Record<ScrapingSource, PublicSourcePolicy> = {
  google_maps: { source: 'google_maps', label: 'Google Maps', loggedOut: true },
  web_search: { source: 'web_search', label: 'Web Search', loggedOut: true },
  bbb: { source: 'bbb', label: 'BBB', loggedOut: true },
  yellowpages: { source: 'yellowpages', label: 'YellowPages', loggedOut: true },
  manta: { source: 'manta', label: 'Manta', loggedOut: true },
  bizbuysell: { source: 'bizbuysell', label: 'BizBuySell', loggedOut: true },
  flippa: { source: 'flippa', label: 'Flippa', loggedOut: true },
  acquire: { source: 'acquire', label: 'Acquire.com', loggedOut: true },
};

/**
 * Conservative ceiling on results requested per scraper. Read from
 * `SCRAPER_MAX_RESULTS_CAP` (default 50). This is a hard cap: even if
 * `MAX_RESULTS_PER_SCRAPER` is set higher, `cappedMaxResults` never returns
 * more than this.
 */
export const MAX_RESULTS_CAP = parseInt(process.env.SCRAPER_MAX_RESULTS_CAP || '50', 10);

/** Default per-scraper result count when a caller doesn't pass one. */
const DEFAULT_MAX_RESULTS = 50;

/**
 * Politeness budget. These are documented constants the scrapers may reference
 * to stay well-behaved; they are intentionally conservative and chosen to fit
 * inside the pipeline's ~300s time budget without adding artificial delays.
 */
export const MAX_CONCURRENT_REQUESTS_PER_SOURCE = 5;
export const MIN_REQUEST_SPACING_MS = 250;

/**
 * Assert that `source` is a registered public, logged-out source. Throws if it
 * isn't on the allowlist — the safety net against scraping anything that would
 * require authentication or isn't sanctioned. Call this at the start of every
 * scrape with the scraper's own RawLead `source` literal.
 */
export function assertPublicSource(source: string): void {
  const policy = PUBLIC_SOURCES[source as ScrapingSource];
  if (!policy || policy.loggedOut !== true) {
    throw new Error(
      `[scrapingPolicy] Refusing to scrape "${source}": not a registered public, ` +
        `logged-out source. Allowed: ${Object.keys(PUBLIC_SOURCES).join(', ')}.`,
    );
  }
}

/**
 * Clamp a requested per-scraper result count to the conservative ceiling.
 * Falls back to a safe default when `requested` is missing/invalid, floors at
 * 1, and never exceeds `MAX_RESULTS_CAP`.
 */
export function cappedMaxResults(requested?: number): number {
  const n = Number.isFinite(requested) ? (requested as number) : DEFAULT_MAX_RESULTS;
  return Math.max(1, Math.min(n, MAX_RESULTS_CAP));
}
