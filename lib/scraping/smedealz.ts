// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser). See scripts/test-smedealz.ts.
//
// smedealz.com — India SME "business bazaar" (small, ~32 seller listings). The
// site is an AngularJS app driven by two open JSON APIs, which we call directly:
//   GET  /ListingAPI/getListings              -> all seller listings (basics)
//   POST /propertyView/viewproperty (comid=N) -> full detail + 3yr financials
// estimate_value is in LAKHS (×1e5 -> rupees); financials (sale/ebidta/pat) are
// raw rupees. Owner name/email/phone are exposed by the API but masked on the
// page, so we DON'T capture them.
//
// CRITERIA-AWARE (Phase 2): the getListings API takes no industry/location filter
// — site has no search. So we page-cap only: we process at most
// SCRAPER_MAX_PAGES * PER_PAGE listings (bounding the per-listing detail POSTs)
// rather than the whole feed. Downstream dedupe/rank do the criteria filtering.

import { RawLead, SearchCriteria } from '@/lib/types';

const SITE = 'https://smedealz.com';
const LIST_API = `${SITE}/ListingAPI/getListings`;
const DETAIL_API = `${SITE}/propertyView/viewproperty`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DETAIL_CONCURRENCY = 5;
const PER_PAGE = 25; // notional feed page size for the SCRAPER_MAX_PAGES cap

const WORKING: Record<string, string> = { W: 'Working', P: 'Partially working', C: 'Closed' };
const SALE: Record<string, string> = { F: 'Fully', P: 'Partially' };

interface ListItem {
  id: string;
  sellcomp_id?: string;
  cat_num?: string;
  cat_name?: string;
  group_name?: string;
  sub_name?: string;
  f_type?: string;
  company_name?: string;
  brief_details?: string;
  manualIndustry?: string;
  state?: string | null;
  city?: string | null;
  estimate_value?: string;
  page_visit_count?: string;
  working_status?: string;
  sale_type?: string;
  pincode?: string;
  verified_logo?: string;
}
interface DetailItem extends ListItem {
  year1?: string; sale1?: string; ebidta1?: string; pat1?: string;
  year2?: string; sale2?: string; ebidta2?: string; pat2?: string;
  year3?: string; sale3?: string; ebidta3?: string; pat3?: string;
  land_area?: string; bulding_area?: string; land_value?: string; bulding_value?: string;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// financial row: "2025: 7,99,65,313  |  2024: 4,73,74,538  |  2023: 26,35,949".
// Values are as-entered by the seller (the site's form is in lakhs, though a few
// sellers typed raw rupees) — so no ₹; the column header notes "(lakhs)".
function finRow(d: DetailItem, metric: 'sale' | 'ebidta' | 'pat'): string {
  const rec = d as unknown as Record<string, string | undefined>;
  const parts: string[] = [];
  for (const i of [1, 2, 3] as const) {
    const yr = rec[`year${i}`];
    const val = num(rec[`${metric}${i}`]);
    if (yr && val != null) parts.push(`${yr}: ${val.toLocaleString('en-IN')}`);
  }
  return parts.join('   |   ');
}

async function fetchDetail(id: string): Promise<DetailItem | null> {
  try {
    const res = await fetch(DETAIL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'User-Agent': UA,
      },
      body: `comid=${encodeURIComponent(id)}`,
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as DetailItem[];
    return Array.isArray(arr) && arr[0] ? arr[0] : null;
  } catch {
    return null;
  }
}

export async function scrapeSmeDealz(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const maxPages = Math.max(1, parseInt(process.env.SCRAPER_MAX_PAGES || '3', 10));
  const cap = maxPages * PER_PAGE;
  const listRes = await fetch(LIST_API, {
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', 'User-Agent': UA },
  });
  if (!listRes.ok) throw new Error(`getListings failed: ${listRes.status}`);
  const all = (await listRes.json()) as ListItem[];
  const list = all.slice(0, cap); // page-cap: bound the per-listing detail POSTs
  console.log(`[smeDealz] listings: ${list.length}/${all.length} (cap ${cap}). Fetching detail…`);

  // detail enrichment (full description + 3yr financials)
  const details = new Map<string, DetailItem>();
  let idx = 0;
  const worker = async () => {
    while (idx < list.length) {
      const it = list[idx++];
      const d = await fetchDetail(it.id);
      if (d) details.set(it.id, d);
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  console.log(`[smeDealz] details fetched: ${details.size}/${list.length}`);

  return list.map((it): RawLead => {
    const d = details.get(it.id) ?? (it as DetailItem);
    const listingId = `${it.sellcomp_id ?? ''}${it.cat_num ?? ''}`; // BB115S + 1410
    const estimateLakh = num(it.estimate_value);
    const sales1 = num(d.sale1);
    const pat1 = num(d.pat1);
    return {
      businessName: it.manualIndustry || it.company_name || 'Unknown',
      address: null,
      city: it.city || d.city || null,
      state: it.state || d.state || null,
      zip: it.pincode || null,
      phone: null, // owner contact is masked on the page — not captured
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: [it.cat_name, it.sub_name].filter(Boolean) as string[],
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'smedealz' as const,
      sourceUrl: `${SITE}/SellerListings/viewDetails/${it.id}`,
      mrr: null,
      askingPrice: estimateLakh != null ? Math.round(estimateLakh * 1e5) : null, // lakhs -> rupees
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: sales1, // current-year sales (raw rupees)
      annualProfit: pat1, // current-year PAT (raw rupees)
      forSale: true,
      founderName: null,
      foundedDate: null,
      rawData: {
        listingId: listingId || null,
        companyName: it.company_name || null,
        firmType: it.f_type || null,
        workingStatus: WORKING[it.working_status ?? ''] || it.working_status || null,
        saleType: SALE[it.sale_type ?? ''] || it.sale_type || null,
        estimateLakh: estimateLakh,
        industry: it.cat_name || null,
        group: it.group_name || null,
        subCategory: it.sub_name || null,
        pincode: it.pincode || null,
        views: it.page_visit_count || null,
        verified: it.verified_logo === '1',
        salesByYear: finRow(d, 'sale'),
        ebidtaByYear: finRow(d, 'ebidta'),
        patByYear: finRow(d, 'pat'),
        landArea: d.land_area || null,
        buildingArea: d.bulding_area || null,
        description: d.brief_details || it.brief_details || null,
      },
    };
  });
}
