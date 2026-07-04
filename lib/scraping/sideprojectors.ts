// LOCAL-ONLY (Phase 1) — but API-based, no browser. SideProjectors exposes a
// JSON endpoint (/project/data); we page it with plain fetch + the XHR headers
// the site uses. Like Microns, the production version could run server-side.
//
// SideProjectors (sideprojectors.com) — PUBLIC side-project/micro-asset
// marketplace (~11k projects). For-Sale only; pre-revenue excluded
// (revenue.has_revenue === false).
//   Default scrapes ALL (complete). Set SP_LIMIT=800 to cap the result.

import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://www.sideprojectors.com';
const API = `${BASE}/project/data`;
// Search token from the site's search URL. If results come back empty, refresh
// it from a current sideprojectors.com/home-search/... URL.
const TOKEN = 'ZmM4rtgJE8';
const TYPES = 'SaaS,Shop,Blog,Website,Mobile,Desktop,Browser,Domain,Other';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 100;

const limitFromEnv = (): number => {
  if (process.env.SP_LIMIT === undefined) return Infinity; // default: complete (all)
  const n = parseInt(process.env.SP_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity; // SP_LIMIT=800 caps; 0/invalid => all
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

async function apiGet(offset: number): Promise<{ projects?: SPProject[]; total?: number }> {
  const url =
    `${API}?savedSearchId=all&query=${TOKEN}&postTypes=sell&projectTypes=${encodeURIComponent(TYPES)}` +
    `&projectPrice=all&revenue=all&projectDate=all&marketId=all&orderBy=created_at&orderType=desc` +
    `&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<{ projects?: SPProject[]; total?: number }>;
}

// CRITERIA-AWARE (Phase 2): the API's projectTypes filter is already digital-only
// (the router only sends SideProjectors for digital searches), and there is no
// per-industry query beyond that. So we page-cap: scan at most SCRAPER_MAX_PAGES
// pages (100/page) instead of the whole ~11k catalogue. SP_LIMIT still caps kept.
export async function scrapeSideProjectors(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const maxPages = Math.max(1, parseInt(process.env.SCRAPER_MAX_PAGES || '3', 10));
  const maxOffset = maxPages * PAGE_SIZE;
  const kept: SPProject[] = [];
  let offset = 0;
  let total = Infinity;
  while (kept.length < limit && offset < total && offset < maxOffset) {
    let data: { projects?: SPProject[]; total?: number };
    try {
      data = await apiGet(offset);
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
