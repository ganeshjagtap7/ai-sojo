// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser, no account). See scripts/test-trustmrr.ts.
//
// trustmrr.com — "database of verified startup revenues" + acquisition marketplace.
// The browse UI is account-gated, but we bypass it entirely: sitemap-0.xml lists
// every startup URL (~4772), and each /startup/<slug> page is public + server-
// rendered (Next.js RSC payload embedded in the HTML). We enumerate the sitemap,
// fetch each detail page, and decode the embedded startup object — including the
// founder's X profile. `onSale` marks the for-sale marketplace listings (~1848).
//   Query-based (Phase 2): capped at SCRAPER_MAX_ITEMS (default 150) per run;
//   slugs matching the mandate's industry keywords are fetched first.

import { RawLead, SearchCriteria } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/scraping/fetchWithTimeout';
import { assertPublicSource } from '@/lib/scraping/scrapingPolicy';

const SITE = 'https://trustmrr.com';
const SITEMAP = `${SITE}/sitemap-0.xml`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CONCURRENCY = 10;

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

// concatenate the Next.js RSC streaming chunks back into one string
function decodeRSC(html: string): string {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  let out = '';
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse(m[1]) as string;
    } catch {
      /* skip */
    }
  }
  return out;
}

// slice a balanced {...} starting at `start`, respecting string literals
function sliceObject(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, j + 1);
    }
  }
  return null;
}

interface Startup {
  name?: string;
  slug?: string;
  description?: string;
  website?: string;
  category?: string;
  categorySlug?: string;
  userCategory?: string;
  userCategorySlug?: string;
  targetAudience?: string;
  country?: string | null;
  foundedDate?: string;
  currentMrr?: number;
  currentLast30DaysRevenue?: number;
  currentTotalRevenue?: number;
  currentActiveSubscriptions?: number;
  onSale?: boolean;
  askingPrice?: number | null;
  cachedMultiple?: number;
  cachedGrowth30d?: number;
  profitMarginLast30Days?: number;
  cachedUniquePageviews?: number;
  cachedOfferCount?: number;
  listingTier?: string;
  paymentProvider?: string;
  revenuecatVerifiedSlug?: string | null;
  xHandle?: string | null;
  xFounderName?: string | null;
  xFollowerCount?: number | null;
  sellerMessage?: string | null;
}

// find the page's main startup object inside the decoded RSC (anchor on "_id",
// whose opening brace is unambiguous; pick the one whose slug matches the page)
function extractStartup(big: string, slug: string): Startup | null {
  const objs: Startup[] = [];
  let i = big.indexOf('"_id"');
  while (i >= 0) {
    const start = big.lastIndexOf('{', i);
    if (start >= 0) {
      const slice = sliceObject(big, start);
      if (slice) {
        try {
          const o = JSON.parse(slice) as Startup;
          if (o && o.slug) objs.push(o);
        } catch {
          /* skip */
        }
      }
    }
    i = big.indexOf('"_id"', i + 1);
  }
  return (
    objs.find((o) => o.slug === slug) ||
    objs.sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0] ||
    null
  );
}

export async function scrapeTrustMRR(criteria?: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('trustmrr');
  const limit = maxItemsFromEnv(process.env.TMRR_LIMIT);
  const headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' };

  // --- 1. Enumerate startup slugs from the public sitemap ---
  const sm = await fetchWithTimeout(SITEMAP, { headers });
  const xml = await sm.text();
  const slugs = Array.from(new Set(Array.from(xml.matchAll(/\/startup\/([a-z0-9-]+)</gi)).map((m) => m[1])));
  // Mandate-relevant slugs first (slug ≈ product name), then the newest rest.
  const kw = keywordsOf(criteria);
  const matches = kw.length ? slugs.filter((sl) => kw.some((w) => sl.includes(w))) : [];
  const rest = slugs.filter((sl) => !matches.includes(sl));
  const targets = [...matches, ...rest].slice(0, limit);
  console.log(`[TrustMRR] sitemap startups: ${slugs.length}; fetching ${targets.length} detail pages…`);

  // --- 2. Fetch + parse each public detail page ---
  const out: RawLead[] = [];
  let idx = 0;
  const thisYear = new Date().getFullYear();
  const worker = async () => {
    while (idx < targets.length) {
      const i = idx++;
      const slug = targets[i];
      try {
        const res = await fetchWithTimeout(`${SITE}/startup/${slug}`, { headers });
        if (!res.ok) continue;
        const s = extractStartup(decodeRSC(await res.text()), slug);
        if (!s) continue;
        const year = s.foundedDate ? parseInt(s.foundedDate.slice(0, 4), 10) : null;
        out.push({
          businessName: s.name || slug,
          address: null,
          city: null,
          state: null,
          zip: null,
          phone: null,
          website: s.website || null,
          googleRating: null,
          reviewCount: null,
          categories: [s.userCategory || s.category, s.category].filter(Boolean) as string[],
          yearsInBusiness: year && year > 1900 && year <= thisYear ? thisYear - year : null,
          employeeCount: null,
          bbbRating: null,
          bbbAccredited: null,
          source: 'trustmrr' as const,
          sourceUrl: `${SITE}/startup/${slug}`,
          mrr: typeof s.currentMrr === 'number' ? Math.round(s.currentMrr) : null,
          askingPrice: typeof s.askingPrice === 'number' ? s.askingPrice : null,
          revenueMultiple: typeof s.cachedMultiple === 'number' ? s.cachedMultiple : null,
          profitMultiple: null,
          annualRevenue: typeof s.currentLast30DaysRevenue === 'number' ? Math.round(s.currentLast30DaysRevenue * 12) : null,
          annualProfit: null,
          forSale: !!s.onSale,
          founderName: s.xFounderName || null,
          foundedDate: s.foundedDate || null,
          rawData: {
            slug,
            category: s.userCategory || s.category || null,
            subCategory: s.category || null,
            targetAudience: s.targetAudience || null,
            country: s.country || null,
            mrr: typeof s.currentMrr === 'number' ? Math.round(s.currentMrr) : null,
            last30DaysRevenue: typeof s.currentLast30DaysRevenue === 'number' ? Math.round(s.currentLast30DaysRevenue) : null,
            totalRevenue: typeof s.currentTotalRevenue === 'number' ? Math.round(s.currentTotalRevenue) : null,
            activeSubscriptions: s.currentActiveSubscriptions ?? null,
            onSale: !!s.onSale,
            askingPrice: typeof s.askingPrice === 'number' ? s.askingPrice : null,
            multiple: typeof s.cachedMultiple === 'number' ? s.cachedMultiple : null,
            growth30d: typeof s.cachedGrowth30d === 'number' ? s.cachedGrowth30d : null,
            profitMargin: s.profitMarginLast30Days ?? null,
            pageviews: s.cachedUniquePageviews ?? null,
            offerCount: s.cachedOfferCount ?? null,
            listingTier: s.listingTier || null,
            verified: s.paymentProvider || null,
            founded: s.foundedDate || null,
            xHandle: s.xHandle || null,
            xFounderName: s.xFounderName || null,
            xFollowers: s.xFollowerCount ?? null,
            xProfileUrl: s.xHandle ? `https://x.com/${s.xHandle}` : null,
            sellerMessage: s.sellerMessage || null,
            website: s.website || null,
            description: s.description || null,
          },
        });
      } catch {
        /* skip */
      }
      if ((i + 1) % 200 === 0) console.log(`[TrustMRR] ${i + 1}/${targets.length} (kept ${out.length})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`[TrustMRR] startups captured: ${out.length} (${out.filter((l) => l.forSale).length} for sale)`);
  return out;
}
