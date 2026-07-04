// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser). See scripts/test-franchisegator.ts.
//
// franchisegator.com — franchise-opportunity directory (national). These are
// franchisors (e.g. "Senior Helpers"), not individual resale businesses, so the
// deal fields (askingPrice/mrr) stay empty; we capture the franchise economics
// instead. Every franchise has ONE detail page regardless of state, so "all
// locations" = the full directory: ~3869 /franchises/<slug>/ URLs in
// sitemap-profiles.xml. Detail pages are plain SSR (no Cloudflare).
//   Query-based (Phase 2): sitemap slugs matching the mandate's industry
//   keywords are fetched first, capped at SCRAPER_MAX_ITEMS (default 150).

import { RawLead, SearchCriteria } from '@/lib/types';

const SITE = 'https://www.franchisegator.com';
const SITEMAP = `${SITE}/sitemap-profiles.xml`;
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

const clean = (s: string | undefined): string =>
  (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();

// <th>Label:</th><td><span>Value</span></td>
function field(html: string, label: string): string {
  const m = html.match(new RegExp(`<th[^>]*>\\s*${label}\\s*:?\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i'));
  return m ? clean(m[1]).replace(/\s*What does .*?mean\?.*$/i, '').trim() : '';
}

export async function scrapeFranchiseGator(criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = maxItemsFromEnv(process.env.FG_LIMIT);
  const headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' };

  // --- 1. Enumerate franchise URLs from the profiles sitemap ---
  const xml = await (await fetch(SITEMAP, { headers })).text();
  const urls = Array.from(new Set(Array.from(xml.matchAll(/<loc>([^<]*\/franchises\/[a-z0-9-]+\/)<\/loc>/gi)).map((m) => m[1])));
  // Mandate-relevant slugs first (slug ≈ franchise name), then the rest.
  const kw = keywordsOf(criteria);
  const matches = kw.length ? urls.filter((u) => kw.some((w) => u.includes(w))) : [];
  const rest = urls.filter((u) => !matches.includes(u));
  const targets = [...matches, ...rest].slice(0, limit);
  console.log(`[FranchiseGator] franchises in sitemap: ${urls.length}; fetching ${targets.length}…`);

  // --- 2. Fetch + parse each detail page ---
  const out: RawLead[] = [];
  let idx = 0;
  const thisYear = new Date().getFullYear();
  const worker = async () => {
    while (idx < targets.length) {
      const i = idx++;
      const url = targets[i];
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const h = await res.text();
        const name = clean((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]).replace(/\s*-\s*Franchise\s*$/i, '');
        if (!name) continue;
        // industry = breadcrumb item before the franchise name (Home › Industries › <Industry> › <Name>)
        const bi = h.indexOf('id="breadcrumbs_container"');
        const crumbs = bi >= 0
          ? Array.from(h.slice(bi, bi + 1500).matchAll(/itemprop="name"[^>]*>([\s\S]*?)</gi)).map((m) => clean(m[1])).filter(Boolean)
          : [];
        // only when a real category crumb exists (Home › Industries › <Industry> › <Name>);
        // some franchise pages omit the category, leaving Home › Industries › <Name> — blank then.
        const industry = crumbs.length >= 4 ? crumbs[crumbs.length - 2] : '';
        // description = the intro paragraph after the <h1> (NOT the SEO meta boilerplate)
        let description = clean((h.match(/<\/h1>([\s\S]*?)Request Free Inform/i) || [])[1]);
        if (!description) description = clean((h.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
        const homeOffice = field(h, 'Home Office');
        const [hoCity, hoState] = homeOffice.split(',').map((s) => s.trim());
        const yearFounded = field(h, 'Year Founded');
        const yf = parseInt(yearFounded, 10);
        out.push({
          businessName: name,
          address: null,
          city: hoCity || null,
          state: hoState || null,
          zip: null,
          phone: null,
          website: null,
          googleRating: null,
          reviewCount: null,
          categories: industry ? [industry] : [],
          yearsInBusiness: Number.isFinite(yf) && yf > 1800 && yf <= thisYear ? thisYear - yf : null,
          employeeCount: null,
          bbbRating: null,
          bbbAccredited: null,
          source: 'franchisegator' as const,
          sourceUrl: url,
          mrr: null,
          askingPrice: null, // franchise opportunity, not a resale — see rawData economics
          revenueMultiple: null,
          profitMultiple: null,
          annualRevenue: null,
          annualProfit: null,
          forSale: true,
          founderName: null,
          foundedDate: yearFounded || null,
          rawData: {
            industry: industry || null,
            liquidCapital: field(h, 'Liquid Capital') || null,
            netWorth: field(h, 'Net Worth') || null,
            franchiseFee: field(h, 'Franchise Fee') || null,
            totalInvestment: field(h, 'Total Investment') || null,
            financing: field(h, 'Financing') || null,
            training: field(h, 'Training') || null,
            veteranDiscount: field(h, 'Veteran Discount') || null,
            sbaApproved: field(h, 'SBA Approved') || null,
            totalUnits: field(h, 'Total Units') || null,
            homeOffice: homeOffice || null,
            yearFounded: yearFounded || null,
            description: description || null,
          },
        });
      } catch {
        /* skip */
      }
      if ((i + 1) % 200 === 0) console.log(`[FranchiseGator] ${i + 1}/${targets.length} (kept ${out.length})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  // group by industry, blank-industry rows always last, then by name
  out.sort((a, b) => {
    const ai = a.categories[0] || '';
    const bi = b.categories[0] || '';
    if (!ai !== !bi) return ai ? -1 : 1; // rows without an industry go to the end
    return ai.localeCompare(bi) || a.businessName.localeCompare(b.businessName);
  });
  console.log(`[FranchiseGator] franchises captured: ${out.length}`);
  return out;
}
