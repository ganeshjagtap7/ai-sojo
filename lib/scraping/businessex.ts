// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser, no login). See scripts/test-businessex.ts.
//
// businessex.com — India SME sale/investor/loan marketplace. We scrape the SALE
// tab only. Two public JSON APIs on bxapi.businessex.com:
//   POST /bexapi/getBusinessListDemo  (BusinessType:"sale") -> paginated listings
//   GET  /bexapi/sellerprofile/<code>  -> detail as a JWT (we decode the payload)
// The list already has most fields (asking price, annual sale, EBITDA, year, etc.);
// the detail JWT adds gross income, reason for sale, pitch, summary, country.
// Owner contact comes back empty (gated server-side) so it isn't captured.
//   Default scrapes ALL (~1346). Set BEX_LIMIT=500 to cap.

import { RawLead, SearchCriteria } from '@/lib/types';

const API = 'https://bxapi.businessex.com/bexapi';
const SITE = 'https://businessex.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PER_PAGE = 50;
const DETAIL_CONCURRENCY = 8;

const limitFromEnv = (): number => {
  if (process.env.BEX_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.BEX_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

const headers = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, 'User-Agent': UA };

interface ListItem {
  title?: string;
  description?: string;
  industry?: string;
  subindustry?: string;
  state?: string;
  city?: string;
  annualsale?: number;
  saleAmount?: string | number;
  askingPrice?: string;
  ebitda?: number;
  ebitdamargin?: number;
  estb_year?: string | number;
  emp_count?: string;
  entity_type?: string;
  business_type?: string;
  seeking_buyers?: number;
  seeking_investors?: number;
  seeking_loan?: number;
  sellerurl?: string;
  profileStr?: string;
}
interface SellerData {
  country?: string;
  business_pitch?: string;
  buyer_sell_reason?: string;
  grossprofit?: number | string;
  saleAmount?: number | string;
  rentals?: string;
  inventory_value?: string;
  company_summary?: string;
  facilities_desc?: string;
  listedBy?: string;
}

const stripHtml = (s: string | undefined): string =>
  (s || '')
    .replace(/<\/(li|p|div|tr|h\d)>/gi, '; ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/;\s*;/g, ';')
    .replace(/;\s*$/, '')
    .trim();

// "1 Crores", "10 Lakhs", "1.25 Crores", "Undisclosed" -> rupees (null if none).
function parseAmt(raw: string | number | undefined | null): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/,/g, '');
  const m = s.match(/([\d.]+)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/cr/.test(s)) n *= 1e7;
  else if (/lakh|lac/.test(s)) n *= 1e5;
  return Math.round(n);
}

// decode JWT payload (base64url, no signature check) -> sellerData
function jwtSellerData(token: string): SellerData | null {
  const parts = token.trim().replace(/^"|"$/g, '').split('.');
  if (parts.length < 2) return null;
  let b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  b += '='.repeat((4 - (b.length % 4)) % 4);
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64').toString('utf-8')) as { sellerData?: SellerData };
    return payload.sellerData ?? null;
  } catch {
    return null;
  }
}

// CRITERIA-AWARE (Phase 2): getBusinessListDemo accepts state/city/industrymain
// filter arrays, but they require BusinessEx's own taxonomy IDs (not free text),
// so we don't populate them here — page-cap only. We fetch at most
// SCRAPER_MAX_PAGES pages instead of the whole SALE tab. The router only sends
// BusinessEx for India searches; downstream dedupe/rank do the filtering.
// (Future: resolve criteria → BusinessEx industry/state IDs and pass them here.)
export async function scrapeBusinessEx(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const maxPages = Math.max(1, parseInt(process.env.SCRAPER_MAX_PAGES || '3', 10));

  // --- 1. List (SALE tab) via getBusinessListDemo, page by page ---
  const items: ListItem[] = [];
  let total = Infinity;
  for (let page = 1; items.length < limit && items.length < total && page <= maxPages; page++) {
    let data: { businesslist?: ListItem[]; businessCount?: number };
    try {
      const res = await fetch(`${API}/getBusinessListDemo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentPage: page,
          state: [], city: [], industrymain: [], industrysub: [],
          BusinessType: 'sale', itemsPerPage: PER_PAGE,
          minInvestment: 0, maxInvestment: 1000000000, annualsalesmin: 0, annualsalesmax: 0,
        }),
      });
      if (!res.ok) break;
      data = (await res.json()) as { businesslist?: ListItem[]; businessCount?: number };
    } catch {
      break;
    }
    const list = data.businesslist ?? [];
    if (typeof data.businessCount === 'number') total = data.businessCount;
    if (list.length === 0) break;
    for (const it of list) {
      items.push(it);
      if (items.length >= limit) break;
    }
    console.log(`[BusinessEx] listed ${items.length}/${Math.min(total, limit)} (page ${page})`);
  }
  console.log(`[BusinessEx] listings: ${items.length}. Fetching detail…`);

  // --- 2. Detail JWT per listing (gross income, reason, pitch, summary) ---
  const details = new Map<string, SellerData>();
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      const code = items[i].profileStr;
      if (!code) continue;
      try {
        const res = await fetch(`${API}/sellerprofile/${code}?userId=0`, { headers });
        if (res.ok) {
          const sd = jwtSellerData(await res.text());
          if (sd) details.set(code, sd);
        }
      } catch {
        /* skip */
      }
      if ((i + 1) % 100 === 0) console.log(`[BusinessEx] detail ${i + 1}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  console.log(`[BusinessEx] details fetched: ${details.size}/${items.length}`);

  const thisYear = new Date().getFullYear();
  return items.map((it): RawLead => {
    const d = (it.profileStr && details.get(it.profileStr)) || ({} as SellerData);
    const year = it.estb_year ? parseInt(String(it.estb_year), 10) : null;
    const grossIncome = parseAmt(d.grossprofit);
    return {
      businessName: it.title || 'Unknown',
      address: null,
      city: it.city || null,
      state: it.state || null,
      zip: null,
      phone: null, // contact is gated (returns empty) — not captured
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: [it.industry, it.subindustry].filter(Boolean) as string[],
      yearsInBusiness: year && year > 1900 && year <= thisYear ? thisYear - year : null,
      employeeCount: null, // emp_count is a range string (e.g. "10-50") — kept in rawData
      bbbRating: null,
      bbbAccredited: null,
      source: 'businessex' as const,
      sourceUrl: it.sellerurl && it.profileStr ? `${SITE}/business/${it.sellerurl}/${it.profileStr}` : SITE,
      mrr: null,
      askingPrice: parseAmt(d.saleAmount) ?? parseAmt(it.saleAmount) ?? parseAmt(it.askingPrice),
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: typeof it.annualsale === 'number' ? it.annualsale : null,
      annualProfit: grossIncome,
      forSale: true,
      founderName: null,
      foundedDate: year ? String(year) : null,
      rawData: {
        askingPriceLabel: it.askingPrice || (typeof it.saleAmount === 'string' ? it.saleAmount : null),
        annualSale: typeof it.annualsale === 'number' ? it.annualsale : null,
        ebitda: typeof it.ebitda === 'number' ? it.ebitda : null,
        ebitdaMargin: it.ebitdamargin ?? null,
        grossIncome,
        establishmentYear: year,
        employees: it.emp_count || null,
        entityType: it.entity_type || null,
        businessType: it.business_type || null,
        industry: it.industry || null,
        subIndustry: it.subindustry || null,
        country: d.country || null,
        reasonForSale: d.buyer_sell_reason || null,
        businessPitch: d.business_pitch || null,
        facilities: stripHtml(d.facilities_desc) || null,
        summary: stripHtml(d.company_summary) || null,
        listedBy: (d.listedBy || '').replace(/^Profile Listed By:\s*/i, '') || null,
        seekingBuyers: it.seeking_buyers === 1,
        seekingInvestors: it.seeking_investors === 1,
        description: it.description || null,
      },
    };
  });
}
