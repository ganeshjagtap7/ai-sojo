// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser). See scripts/test-franchisegator.ts.
//
// franchisegator.com — franchise-opportunity directory (national). These are
// franchisors (e.g. "Senior Helpers"), not individual resale businesses, so the
// deal fields (askingPrice/mrr) stay empty; we capture the franchise economics
// instead. Every franchise has ONE detail page regardless of state, so "all
// locations" = the full directory: ~3869 /franchises/<slug>/ URLs in
// sitemap-profiles.xml. Detail pages are plain SSR (no Cloudflare).
//   Default scrapes ALL (~3869). Set FG_LIMIT=300 to cap.

import { RawLead, SearchCriteria } from '@/lib/types';

const SITE = 'https://www.franchisegator.com';
const SITEMAP = `${SITE}/sitemap-profiles.xml`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CONCURRENCY = 10;
const PER_PAGE = 25; // notional listing-page size for the SCRAPER_MAX_PAGES cap

const limitFromEnv = (): number => {
  if (process.env.FG_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.FG_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
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

// CRITERIA-AWARE (Phase 2): FranchiseGator profiles come from a flat sitemap with
// no per-industry/state listing pages to target, and franchises are national (not
// location-bound). So we page-cap: fetch at most SCRAPER_MAX_PAGES * PER_PAGE
// profile pages instead of the whole ~3869-entry sitemap. The router only sends
// FranchiseGator for franchise searches. (Future: map criteria → category pages.)
export async function scrapeFranchiseGator(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const maxPages = Math.max(1, parseInt(process.env.SCRAPER_MAX_PAGES || '3', 10));
  const cap = Math.min(limit, maxPages * PER_PAGE);
  const headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' };

  // --- 1. Enumerate franchise URLs from the profiles sitemap ---
  const xml = await (await fetch(SITEMAP, { headers })).text();
  const urls = Array.from(new Set(Array.from(xml.matchAll(/<loc>([^<]*\/franchises\/[a-z0-9-]+\/)<\/loc>/gi)).map((m) => m[1])));
  const targets = urls.slice(0, cap === Infinity ? urls.length : cap);
  console.log(`[FranchiseGator] franchises in sitemap: ${urls.length}; fetching ${targets.length} (cap ${cap})…`);

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
