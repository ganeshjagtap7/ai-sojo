// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser). See scripts/test-buybiz.ts.
//
// buybiz.co.in (BuyBizApp) — small India/US SME marketplace (~24 listings across
// Small Business, Company, Trademark, Patent, Copyrights, Be Investor).
// It's a JS-rendered SPA backed by a JSON API on admin.buybiz.co.in. A single
// GET /api/get-item?limit=N returns ALL listings fully populated: price+currency,
// city/state/country, seller name/email/phone (when public), and category-specific
// custom fields. So we just hit that endpoint — no per-listing detail calls.

import { RawLead, SearchCriteria } from '@/lib/types';
import { assertPublicSource } from '@/lib/scraping/scrapingPolicy';

const API = 'https://admin.buybiz.co.in/api/get-item';
const SITE = 'https://buybiz.co.in';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface CFValue { value?: unknown }
interface CustomField { name?: string; value?: unknown; custom_field_value?: CFValue | null }
interface ApiUser { name?: string; email?: string | null; mobile?: string | null; show_personal_details?: number }
interface ApiItem {
  id: number;
  name?: string;
  slug?: string;
  description?: string;
  price?: number | null;
  currency?: string | null;
  address?: string | null;
  contact?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  category_id?: number;
  expiry_date?: string | null;
  clicks?: number;
  created_at?: string | null;
  user?: ApiUser | null;
  category?: { name?: string } | null;
  custom_fields?: CustomField[];
}

// digits only -> number ("100000" -> 100000, "₹ 4,000" -> 4000). null if none.
function parseNum(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const d = raw.replace(/[^\d.]/g, '');
  if (!d) return null;
  const n = parseFloat(d);
  return Number.isFinite(n) ? n : null;
}

// The actual answer lives in custom_field_value.value (a list); fall back to .value.
function cfValue(cf: CustomField): string {
  const cfv = cf.custom_field_value;
  const v = cfv && typeof cfv === 'object' && 'value' in cfv ? cfv.value : cf.value;
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim() !== '').map(String).join(', ').trim();
  return v == null ? '' : String(v).trim();
}

export async function scrapeBuyBiz(_criteria?: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('buybiz');
  const items: ApiItem[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await fetch(`${API}?page=${page}&limit=50&sort_by=new-to-old`, {
      headers: { Accept: 'application/json', 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) break;
    const json = (await res.json()) as { data?: { data?: ApiItem[]; last_page?: number; total?: number } };
    const pageItems = json.data?.data ?? [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    lastPage = json.data?.last_page ?? page;
    page++;
  } while (page <= lastPage);

  console.log(`[BuyBiz] fetched ${items.length} listings`);

  const thisYear = new Date().getFullYear();
  return items.map((it): RawLead => {
    const cf: Record<string, string> = {};
    for (const c of it.custom_fields ?? []) {
      if (c.name) cf[c.name] = cfValue(c);
    }
    const yearStr = cf['Year Started'] || cf['Year Of Incorporation'] || '';
    const year = parseNum(yearStr);
    const turnover = parseNum(cf['Turnover (Annual)']);
    const user = it.user ?? {};
    const showContact = user.show_personal_details === 1;

    // category-specific fields beyond the common business ones -> a catch-all blob
    const common = new Set([
      'Location', 'Year Started', 'Year Of Incorporation', 'Type', 'Employees',
      'Turnover (Annual)', 'Monthly Fixed Expenses', 'Investment Ask', 'Sector', 'GST Registered',
    ]);
    const other = Object.entries(cf)
      .filter(([k, v]) => !common.has(k) && v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');

    return {
      businessName: it.name || 'Unknown',
      address: it.address || null,
      city: it.city || null,
      state: it.state || null,
      zip: null,
      phone: null, // seller phone is in the API but not shown on the page — not captured
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: [it.category?.name].filter(Boolean) as string[],
      yearsInBusiness: year && year > 1900 && year <= thisYear ? thisYear - year : null,
      employeeCount: parseNum(cf['Employees']),
      bbbRating: null,
      bbbAccredited: null,
      source: 'buybiz' as const,
      sourceUrl: it.slug ? `${SITE}/product-details/${it.slug}` : SITE,
      mrr: null,
      askingPrice: parseNum(it.price), // mixed currency — see rawData.currency
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: turnover,
      annualProfit: null,
      forSale: it.category_id !== 15, // category 15 = "Be Investor" (demand-side)
      founderName: showContact ? user.name || null : null,
      foundedDate: yearStr || null,
      rawData: {
        adId: it.id,
        category: it.category?.name ?? null,
        categoryId: it.category_id ?? null,
        currency: it.currency ?? null,
        country: it.country ?? null,
        sellerName: showContact ? user.name ?? null : null,
        sellerEmail: showContact ? user.email ?? null : null,
        postedAt: it.created_at ?? null,
        expiryDate: it.expiry_date ?? null,
        clicks: it.clicks ?? null,
        description: it.description ?? null,
        location: cf['Location'] ?? null,
        yearStarted: yearStr || null,
        type: cf['Type'] ?? null,
        employees: cf['Employees'] ?? null,
        turnoverAnnual: cf['Turnover (Annual)'] ?? null,
        monthlyFixedExpenses: cf['Monthly Fixed Expenses'] ?? null,
        investmentAsk: cf['Investment Ask'] ?? null,
        sector: cf['Sector'] ?? null,
        gstRegistered: cf['GST Registered'] ?? null,
        otherDetails: other || null,
      },
    };
  });
}
