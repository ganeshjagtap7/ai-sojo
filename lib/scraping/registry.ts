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
  // ── Playwright sources — DISABLED until each has an Apify actor (Phase 4) ─
  pendingApify('quietlight', 'Quiet Light', 'us', 'deal_listing', 'digital'),
  pendingApify('websiteclosers', 'Website Closers', 'us', 'deal_listing', 'digital'),
  pendingApify('synergy', 'Synergy Business Brokers', 'us', 'deal_listing', 'any'),
  pendingApify('tobuz', 'Tobuz', 'india', 'deal_listing', 'any'),
  pendingApify('trustpilot', 'Trustpilot', 'global', 'niche_directory', 'any'),
  pendingApify('investorsclub', 'Investors Club', 'global', 'micro_saas', 'digital'),
  pendingApify('indiabiz', 'IndiaBizForSale', 'india', 'deal_listing', 'any'),
  pendingApify('exitbid', 'ExitBid', 'global', 'micro_saas', 'digital'),
  pendingApify('businessdeals', 'BusinessDeals.in', 'india', 'deal_listing', 'any'),
  pendingApify('apppeak', 'AppPeak', 'global', 'micro_saas', 'digital'),
  pendingApify('startupage', 'StartuPage', 'global', 'micro_saas', 'digital', true),
  pendingApify('motioninvest', 'Motion Invest', 'global', 'micro_saas', 'digital', true),
];

/** Enabled sources minus any listed in the SCRAPER_DISABLED_SOURCES kill switch. */
export function enabledSources(): SourceDef[] {
  const killed = (process.env.SCRAPER_DISABLED_SOURCES || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return SOURCES.filter((s) => s.enabled && !killed.includes(s.id));
}
