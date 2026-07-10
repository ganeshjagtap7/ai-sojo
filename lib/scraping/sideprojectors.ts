// LOCAL-ONLY (Phase 1) — but API-based, no browser. SideProjectors exposes a
// JSON endpoint (/project/data); we page it with plain fetch + the XHR headers
// the site uses. Like Microns, the production version could run server-side.
//
// SideProjectors (sideprojectors.com) — PUBLIC side-project/micro-asset
// marketplace (~11k projects). For-Sale only; pre-revenue excluded
// (revenue.has_revenue === false).
//   Query-based (Phase 2): project types derived from the mandate keywords;
//   capped at SCRAPER_MAX_ITEMS (default 150) per run.

import { RawLead, SearchCriteria } from '@/lib/types';
import { assertPublicSource } from '@/lib/scraping/scrapingPolicy';

const BASE = 'https://www.sideprojectors.com';
const API = `${BASE}/project/data`;
// Search token from the site's search URL. If results come back empty, refresh
// it from a current sideprojectors.com/home-search/... URL.
const TOKEN = 'ZmM4rtgJE8';
const TYPES = 'SaaS,Shop,Blog,Website,Mobile,Desktop,Browser,Domain,Other';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;

const maxItemsFromEnv = (fallbackEnv: string | undefined): number => {
  // Per-search cap: SCRAPER_MAX_ITEMS (global) or the scraper-specific legacy
  // env; a full-site sweep is never allowed in the request path.
  const n = parseInt(process.env.SCRAPER_MAX_ITEMS ?? fallbackEnv ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 150;
};

const keywordsOf = (criteria?: SearchCriteria): string[] => {
  if (!criteria) return [];
  return [criteria.industry.primary, ...criteria.industry.subSectors, ...criteria.industry.keywords]
    .join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
};

interface Revenue { has_revenue?: boolean; revenue_range?: string }
interface Metrics { avg_monthly_users?: string; avg_monthly_views?: string; avg_downloads?: string }
interface SPProject {
  id: number | string;
  name?: string;
  pitch?: string;
  description?: string;
  project_type?: string;
  post_type?: string;
  offer_price?: number | null;
  price?: string;
  revenue?: Revenue;
  metrics?: Metrics;
  username?: string;
  is_identity_verified?: boolean;
  created_at_proper?: string;
}

const slugify = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stripHtml = (s: string) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Map mandate keywords to the site's own project-type filter so we page
// through relevant inventory only (falls back to all types).
function typesFor(criteria?: SearchCriteria): string {
  const hay = keywordsOf(criteria).join(' ');
  const picked = new Set<string>();
  if (/saas|software|b2b|app\b/.test(hay)) picked.add('SaaS');
  if (/shop|ecommerce|commerce|store|retail/.test(hay)) picked.add('Shop');
  if (/blog|content|newsletter|media/.test(hay)) picked.add('Blog');
  if (/mobile|ios|android/.test(hay)) picked.add('Mobile');
  if (/domain/.test(hay)) picked.add('Domain');
  if (/website|site/.test(hay)) picked.add('Website');
  return picked.size ? Array.from(picked).join(',') : TYPES;
}

async function apiGet(offset: number, types: string): Promise<{ projects?: SPProject[]; total?: number }> {
  const url =
    `${API}?savedSearchId=all&query=${TOKEN}&postTypes=sell&projectTypes=${encodeURIComponent(types)}` +
    `&projectPrice=all&revenue=all&projectDate=all&marketId=all&orderBy=created_at&orderType=desc` +
    `&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<{ projects?: SPProject[]; total?: number }>;
}

export async function scrapeSideProjectors(criteria?: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('sideprojectors');
  const limit = maxItemsFromEnv(process.env.SP_LIMIT);
  const types = typesFor(criteria);
  const kept: SPProject[] = [];
  let offset = 0;
  let total = Infinity;
  while (kept.length < limit && offset < total) {
    let data: { projects?: SPProject[]; total?: number };
    try {
      data = await apiGet(offset, types);
    } catch (e) {
      console.error(`[SideProjectors] fetch failed at offset ${offset}: ${(e as Error).message}`);
      break;
    }
    const projects = data.projects || [];
    if (typeof data.total === 'number') total = data.total;
    if (projects.length === 0) break;
    for (const p of projects) {
      if (p.post_type !== 'sell') continue; // For Sale only
      if (p.revenue && p.revenue.has_revenue === false) continue; // exclude pre-revenue only
      kept.push(p);
      if (kept.length >= limit) break;
    }
    offset += PAGE_SIZE;
    console.log(`[SideProjectors] kept ${kept.length} (scanned offset ${offset}/${total})`);
  }
  console.log(`[SideProjectors] total kept: ${kept.length}${limit === Infinity ? ' (all)' : ` (cap ${limit})`}`);

  return kept.map((p) => ({
    businessName: p.name || 'Unknown',
    address: null, city: null, state: null, zip: null, phone: null, website: null,
    googleRating: null, reviewCount: null,
    categories: p.project_type ? [p.project_type] : [],
    yearsInBusiness: null,
    employeeCount: null,
    bbbRating: null, bbbAccredited: null,
    source: 'sideprojectors' as const,
    sourceUrl: `${BASE}/project/${p.id}/${slugify(p.name || '')}`,
    mrr: null, // revenue is a monthly range, not exact (kept in rawData)
    askingPrice: typeof p.offer_price === 'number' ? p.offer_price : null,
    revenueMultiple: null,
    profitMultiple: null,
    annualRevenue: null,
    annualProfit: null,
    forSale: true,
    founderName: null,
    foundedDate: null,
    rawData: {
      pitch: p.pitch ?? null,
      projectType: p.project_type ?? null,
      priceNote: p.price ?? null,
      revenueRange: p.revenue?.revenue_range ?? null,
      hasRevenue: p.revenue?.has_revenue ?? null,
      avgMonthlyUsers: p.metrics?.avg_monthly_users ?? null,
      avgMonthlyViews: p.metrics?.avg_monthly_views ?? null,
      seller: p.username ?? null,
      verified: !!p.is_identity_verified,
      createdAt: p.created_at_proper ?? null,
      description: stripHtml(p.description || ''),
    },
  }));
}
