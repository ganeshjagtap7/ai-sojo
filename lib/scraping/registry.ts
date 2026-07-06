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
  region: 'us' | 'india' | 'global';
  /** What kind of leads it produces — drives routing. */
  kind: 'local_business' | 'deal_listing' | 'micro_saas' | 'franchise' | 'niche_directory';
  /** Industry tags this source is good for. 'any' matches everything. */
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

/**
 * Lazy dynamic imports keep Playwright-based modules out of the Next.js
 * bundle. NEVER convert these to top-level imports — Playwright cannot load
 * on Vercel and the build will break.
 */
export const SOURCES: SourceDef[] = [
  // ── Always-on core (existing behavior, unchanged) ──────────────────────
  {
    id: 'google_maps', label: 'Google Maps', region: 'global', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) =>
      (await import('@/lib/scraping/googleMaps')).scrapeGoogleMaps(queries.googleMaps, criteria.location),
  },
  {
    id: 'web_search', label: 'Web search', region: 'global', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ queries }) => (await import('@/lib/scraping/webSearch')).scrapeWebSearch(queries.webSearch),
  },
  {
    id: 'bbb', label: 'BBB', region: 'us', kind: 'local_business',
    industries: 'any', runtime: 'inline', gated: false, alwaysRun: true, enabled: true,
    run: async ({ criteria, queries }) => (await import('@/lib/scraping/bbb')).scrapeBBB(queries.bbb, criteria.location),
  },
  // ── Routed US local-business directories (were always-on; now routed) ──
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
  // ── Routed deal-listing sources — fetch-based, wire now ────────────────
  {
    id: 'businessesforsale', label: 'BusinessesForSale', region: 'us', kind: 'deal_listing',
    industries: 'any', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) =>
      (await import('@/lib/scraping/businessesforsale')).scrapeBusinessesForSale(criteria),
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
  // ── Niche directories — router only picks them for matching industries ─
  {
    id: 'hvacinformed', label: 'HVACinformed', region: 'us', kind: 'niche_directory',
    industries: ['hvac', 'heating', 'cooling', 'air conditioning'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/hvacinformed')).scrapeHvacInformed(criteria),
  },
  {
    id: 'esa', label: 'ESA Contractors', region: 'us', kind: 'niche_directory',
    industries: ['security', 'alarm', 'fire'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/esaContractors')).scrapeEsaContractors(criteria),
  },
  {
    id: 'serviceexperts', label: 'Service Experts', region: 'us', kind: 'niche_directory',
    industries: ['hvac', 'plumbing', 'heating', 'cooling'], runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/serviceExperts')).scrapeServiceExperts(criteria),
  },
  {
    id: 'producthunt', label: 'Product Hunt', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'inline', gated: false, enabled: true,
    run: async ({ criteria }) => (await import('@/lib/scraping/producthunt')).scrapeProductHunt(criteria),
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
    run: async ({ criteria }) => (await import('@/lib/scraping/mergerdomo')).scrapeMergerDomoSale(criteria),
  },
  // ── Playwright sources now LIVE via a self-owned Apify actor (Phase 4) ────
  {
    id: 'exitbid', label: 'ExitBid', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'apify', gated: false, enabled: true,
    // Actor slug comes from env so the same code runs against any account (free
    // test account now, admin's paid account in production). Set EXITBID_ACTOR.
    run: async () => {
      const slug = process.env.EXITBID_ACTOR;
      if (!slug) throw new Error('EXITBID_ACTOR not set — deploy the exitbid Apify actor and set its slug');
      return (await import('@/lib/scraping/apifyRunner')).runApifyScraper(slug, { maxItems: 50 });
    },
  },
  {
    id: 'apppeak', label: 'AppPeak', region: 'global', kind: 'micro_saas',
    industries: 'digital', runtime: 'apify', gated: false, enabled: true,
    run: async () => {
      const slug = process.env.APPPEAK_ACTOR;
      if (!slug) throw new Error('APPPEAK_ACTOR not set — deploy the apppeak Apify actor and set its slug');
      return (await import('@/lib/scraping/apifyRunner')).runApifyScraper(slug, { maxItems: 50 });
    },
  },
  {
    id: 'indiabiz', label: 'IndiaBizForSale', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'apify', gated: false, enabled: true,
    run: async () => {
      const slug = process.env.INDIABIZ_ACTOR;
      if (!slug) throw new Error('INDIABIZ_ACTOR not set — deploy the indiabiz Apify actor and set its slug');
      return (await import('@/lib/scraping/apifyRunner')).runApifyScraper(slug, { maxItems: 50 });
    },
  },
  {
    id: 'businessdeals', label: 'BusinessDeals.in', region: 'india', kind: 'deal_listing',
    industries: 'any', runtime: 'apify', gated: false, enabled: true,
    run: async () => {
      const slug = process.env.BUSINESSDEALS_ACTOR;
      if (!slug) throw new Error('BUSINESSDEALS_ACTOR not set — deploy the businessdeals Apify actor and set its slug');
      return (await import('@/lib/scraping/apifyRunner')).runApifyScraper(slug, { maxItems: 50 });
    },
  },
  // ── Playwright sources — DISABLED until each has an Apify actor (Phase 4) ─
  // runtime:'apify' means "will be called via Apify"; run() throws until then.
  ...([
    ['quietlight', 'Quiet Light', 'us', 'deal_listing', 'digital'],
    ['websiteclosers', 'Website Closers', 'us', 'deal_listing', 'digital'],
    ['synergy', 'Synergy Business Brokers', 'us', 'deal_listing', 'any'],
    ['tobuz', 'Tobuz', 'india', 'deal_listing', 'any'],
    ['trustpilot', 'Trustpilot', 'global', 'niche_directory', 'any'],
    ['investorsclub', 'Investors Club', 'global', 'micro_saas', 'digital'],
    ['startupage', 'StartuPage', 'global', 'micro_saas', 'digital'],
    ['motioninvest', 'Motion Invest', 'global', 'micro_saas', 'digital'],
  ] as const).map(([id, label, region, kind, industries]): SourceDef => ({
    id: id as RawLead['source'], label, region, kind,
    industries: industries === 'any' ? 'any' : 'digital',
    runtime: 'apify',
    gated: id === 'startupage' || id === 'motioninvest',
    enabled: false,
    run: async () => {
      throw new Error(`${id} runs via Apify actor — not yet deployed (see Phase 4 of the plan)`);
    },
  })),
];

export function enabledSources(): SourceDef[] {
  const killed = (process.env.SCRAPER_DISABLED_SOURCES || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return SOURCES.filter((s) => s.enabled && !killed.includes(s.id));
}
