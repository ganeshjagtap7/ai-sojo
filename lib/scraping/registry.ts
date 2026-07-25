import { SearchCriteria, RawLead } from '@/lib/types';
import { generateSearchQueries } from '@/lib/ai/queryGenerator';

export type GeneratedQueries = Awaited<ReturnType<typeof generateSearchQueries>>;

export interface SourceRunContext {
  criteria: SearchCriteria;
  queries: GeneratedQueries;
}

export interface SourceDef {
  id: RawLead['source'];
  label: string;
  /** Where this source's inventory lives. */
  region: 'us' | 'india' | 'canada' | 'global';
  /** What kind of leads it produces — drives routing. */
  kind: 'local_business' | 'deal_listing' | 'micro_saas' | 'franchise' | 'niche_directory';
  /** Industry fit: 'any' matches everything, 'digital' requires a digital
   *  thesis, a tag array requires a keyword match (niche directories). */
  industries: 'any' | 'digital' | string[];
  /** inline = runs in the Vercel function; apify = called via Apify API. */
  runtime: 'inline' | 'apify';
  /** Requires a logged-in session/token. */
  gated: boolean;
  /** Runs on every search regardless of routing (the original core). */
  alwaysRun?: boolean;
  enabled: boolean;
  run: (ctx: SourceRunContext) => Promise<RawLead[]>;
}

/** Playwright-based sources awaiting their Apify actor (Phase 4 of the plan).
 *  They stay disabled; run() throws so a misconfiguration is loud, and the
 *  module is never imported so Playwright stays out of the Next.js bundle. */
const pendingApify = (
  id: RawLead['source'],
  label: string,
  region: SourceDef['region'],
  kind: SourceDef['kind'],
  industries: SourceDef['industries'],
  gated = false,
): SourceDef => ({
  id, label, region, kind, industries, runtime: 'apify', gated, enabled: false,
  run: async () => {
    throw new Error(`${id} runs via an Apify actor that is not deployed yet (plan Phase 4)`);
  },
});

/** A self-owned Playwright scraper deployed as an Apify actor. `envVar` holds
 *  the deployed actor's slug/id (set in Vercel once `apify push`-ed). The source
 *  is ENABLED only when that env var is present, so this stays a no-op in prod
 *  until the actor is actually deployed — then it flips on by itself. The actor
 *  outputs RawLead-shaped rows, so runApifyScraper returns them directly. */
const deployedApify = (
  id: RawLead['source'],
  label: string,
  region: SourceDef['region'],
  kind: SourceDef['kind'],
  industries: SourceDef['industries'],
  envVar: string,
): SourceDef => ({
  id, label, region, kind, industries, runtime: 'apify', gated: false,
  enabled: !!process.env[envVar],
  run: async () => {
    const slug = process.env[envVar];
    if (!slug) throw new Error(`${envVar} not set — deploy the ${id} Apify actor and set its slug`);
    // These are browser actors that fetch each listing's detail page one-by-one,
    // so item count drives runtime directly. Keep it modest (default 20) so the
    // pipeline stays under Vercel's 300s ceiling; tune via CUSTOM_ACTOR_MAX_ITEMS.
    const maxItems = parseInt(process.env.CUSTOM_ACTOR_MAX_ITEMS || '20', 10);
    return (await import('@/lib/scraping/apifyRunner')).runApifyScraper(slug, { maxItems });
  },
});

/**
 * Every scraper source the product knows about. Routed sources are picked per
 * search by lib/scraping/router.ts; alwaysRun sources run on every search.
 * Order matters: the router fills its per-search cap in this order, so
 * higher-value sources come first within each group.
 *
 * All imports are lazy (dynamic) so disabled/Playwright modules never enter
 * the production bundle.
 */
export const SOURCES: SourceDef[] = [
  // ── Always-on core (pre-router behavior, unchanged) ─────────────────────
  {
    id: 'google_maps', label: 'Google Maps', region: 'global', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) =>
      (await import('@/lib/scraping/googleMaps')).scrapeGoogleMaps(queries.googleMaps, criteria.location),
  },
  {
    id: 'web_search', label: 'Web search', region: 'global', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) => {
      const { scrapeWebSearch } = await import('@/lib/scraping/webSearch');
      const { countryCodeOf } = await import('@/lib/geo');
      return scrapeWebSearch(queries.webSearch, countryCodeOf(criteria.location.country));
    },
  },
  {
    id: 'bbb', label: 'BBB', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) =>
      (await import('@/lib/scraping/bbb')).scrapeBBB(queries.bbb, criteria.location),
  },
  // ── Routed US local-business directories (previously always-on) ─────────
  {
    id: 'yellowpages', label: 'YellowPages', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria, queries }) =>
      (await import('@/lib/scraping/yellowpages')).scrapeYellowPages(queries.yellowpages, criteria.location),
  },
  {
    id: 'manta', label: 'Manta', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/manta')).scrapeManta(criteria),
  },
  // ── Routed deal-listing sources — fetch-based, live now ─────────────────
  {
    id: 'businessesforsale', label: 'BusinessesForSale', region: 'us', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) =>
      (await import('@/lib/scraping/businessesforsale')).scrapeBusinessesForSale(criteria),
  },
  {
    // US SMB marketplace via the shahidirfan/bizbuysell-scraper Apify actor.
    id: 'bizbuysell', label: 'BizBuySell', region: 'us', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/bizbuysell')).scrapeBizBuySell(criteria),
  },
  {
    id: 'businessex', label: 'BusinessEx', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/businessex')).scrapeBusinessEx(criteria),
  },
  {
    id: 'buybiz', label: 'BuyBiz', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/buybiz')).scrapeBuyBiz(criteria),
  },
  {
    id: 'smedealz', label: 'smeDealz', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/smedealz')).scrapeSmeDealz(criteria),
  },
  {
    id: 'franchisegator', label: 'FranchiseGator', region: 'us', kind: 'franchise',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/franchisegator')).scrapeFranchiseGator(criteria),
  },
  {
    // Global online-business marketplace via the parseforge/flippa-scraper actor.
    id: 'flippa', label: 'Flippa', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/flippa')).scrapeFlippa(criteria),
  },
  {
    // Acquire.com (global SaaS/startup marketplace) via crawlerbros/acquire-scraper.
    id: 'acquire', label: 'Acquire.com', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/acquire')).scrapeAcquire(criteria),
  },
  {
    // Empire Flippers (global curated online-business marketplace) via memo23/empireflippers-scraper.
    id: 'empireflippers', label: 'Empire Flippers', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/empireflippers')).scrapeEmpireFlippers(criteria),
  },
  {
    id: 'sideprojectors', label: 'SideProjectors', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/sideprojectors')).scrapeSideProjectors(criteria),
  },
  {
    id: 'trustmrr', label: 'TrustMRR', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/trustmrr')).scrapeTrustMRR(criteria),
  },
  {
    id: 'producthunt', label: 'Product Hunt', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/producthunt')).scrapeProductHunt(criteria),
  },
  // ── Niche directories — routed only when the industry matches their tags ─
  {
    id: 'hvacinformed', label: 'HVACinformed', region: 'us', kind: 'niche_directory',
    industries: ['hvac', 'heating', 'cooling', 'air conditioning'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/hvacinformed')).scrapeHvacInformed(criteria),
  },
  {
    // Ontario (Canada) Electrical Safety Authority licence directory.
    id: 'esa', label: 'ESA Contractors', region: 'canada', kind: 'niche_directory',
    industries: ['electrical', 'electric', 'electrician'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/esaContractors')).scrapeEsaContractors(criteria),
  },
  {
    id: 'serviceexperts', label: 'Service Experts', region: 'us', kind: 'niche_directory',
    industries: ['hvac', 'plumbing', 'heating', 'cooling'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/serviceExperts')).scrapeServiceExperts(criteria),
  },
  // ── Gated fetch sources — DISABLED pending compliance sign-off (Phase 3) ─
  {
    id: 'microns', label: 'Microns', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: true, enabled: false,
    run: async ({ criteria }) => (await import('@/lib/scraping/microns')).scrapeMicrons(criteria),
  },
  {
    id: 'mergerdomo', label: 'MergerDomo', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: true, enabled: false,
    run: async ({ criteria }) => (await import('@/lib/scraping/mergerdomo')).scrapeMergerDomo('sale', criteria),
  },
  // ── Self-owned Playwright scrapers, deployed as Apify actors. Each is enabled
  //    only once its *_ACTOR env var (the deployed actor slug) is set in Vercel;
  //    until then the router skips it, so prod is unchanged. ────────────────────
  deployedApify('quietlight', 'Quiet Light', 'us', 'deal_listing', 'digital', 'QUIETLIGHT_ACTOR'),
  deployedApify('websiteclosers', 'Website Closers', 'us', 'deal_listing', 'digital', 'WEBSITECLOSERS_ACTOR'),
  deployedApify('synergy', 'Synergy Business Brokers', 'us', 'deal_listing', 'any', 'SYNERGY_ACTOR'),
  deployedApify('tobuz', 'Tobuz', 'india', 'deal_listing', 'any', 'TOBUZ_ACTOR'),
  deployedApify('trustpilot', 'Trustpilot', 'global', 'niche_directory', 'any', 'TRUSTPILOT_ACTOR'),
  deployedApify('investorsclub', 'Investors Club', 'global', 'micro_saas', 'digital', 'INVESTORSCLUB_ACTOR'),
  deployedApify('indiabiz', 'IndiaBizForSale', 'india', 'deal_listing', 'any', 'INDIABIZ_ACTOR'),
  deployedApify('exitbid', 'ExitBid', 'global', 'micro_saas', 'digital', 'EXITBID_ACTOR'),
  deployedApify('businessdeals', 'BusinessDeals.in', 'india', 'deal_listing', 'any', 'BUSINESSDEALS_ACTOR'),
  deployedApify('apppeak', 'AppPeak', 'global', 'micro_saas', 'digital', 'APPPEAK_ACTOR'),
  // Compliance-blocked (login-gated) — stay disabled stubs until sign-off.
  pendingApify('startupage', 'StartuPage', 'global', 'micro_saas', 'digital', true),
  pendingApify('motioninvest', 'Motion Invest', 'global', 'micro_saas', 'digital', true),
];

/** Enabled sources minus any listed in the SCRAPER_DISABLED_SOURCES kill switch. */
export function enabledSources(): SourceDef[] {
  const killed = (process.env.SCRAPER_DISABLED_SOURCES || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return SOURCES.filter((s) => s.enabled && !killed.includes(s.id));
}
