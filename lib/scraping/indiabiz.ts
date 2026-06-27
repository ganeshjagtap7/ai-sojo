// ⚠️ LOCAL-ONLY (Phase 1). Uses Playwright; do NOT import into the app / pipeline.
// See scripts/test-indiabiz.ts.
//
// IndiaBizForSale (indiabizforsale.com) — PUBLIC India SME marketplace (~16k).
// Listings come from a POST API (/search/now, page=N). That gives the basics
// (title, industry, location, asking-price RANGE, sale type, description). The
// rich fields (exact asking price, min ticket, Entity Type, Started year,
// Turnover, Employees, Operational Status, About, Reason) are on each detail page, so we
// visit those. Contact details are masked (gated) — not captured.
//   Default scrapes ALL (huge: ~16k detail visits). Set IB_LIMIT=500 to cap.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://www.indiabizforsale.com';
const SEARCH_API = `${BASE}/search/now`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM_TAG = '<script>globalThis.__name=globalThis.__name||function(f){return f};</script>';
const DETAIL_CONCURRENCY = 5;

const limitFromEnv = (): number => {
  if (process.env.IB_LIMIT === undefined) return Infinity; // default: complete
  const n = parseInt(process.env.IB_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity; // IB_LIMIT=500 caps; 0 => all
};

// "INR 35.00 Cr", "INR 30.00 L", "10-50 Lakh" -> rupees.
// Suffixes: L/Lac/Lakh = 1e5, Cr/Crore = 1e7, K = 1e3.
function parseINR(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/,/g, '');
  const m = s.match(/([\d.]+)\s*(crore|cr|lakh|lac|l|k)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2] || '';
  if (u === 'crore' || u === 'cr') return Math.round(n * 1e7);
  if (u === 'lakh' || u === 'lac' || u === 'l') return Math.round(n * 1e5);
  if (u === 'k') return Math.round(n * 1e3);
  return Math.round(n);
}

interface SearchItem {
  id: number | string;
  seller_id?: string;
  title?: string;
  industry?: string;
  subcategory?: string;
  city?: string;
  state?: string;
  country?: string;
  asking_price?: string;
  sale_type?: string[];
  product_service?: string;
  listing_url?: string;
  listing_currency?: string;
  gst_verified?: number;
  vetted_status?: boolean;
  featured_listing?: number;
}
interface Detail {
  askingPriceExact: string;
  entityType: string;
  startedIn: string;
  turnover: string;
  employees: string;
  operationalStatus: string;
  minTicket: string;
  about: string;
  reason: string;
}

export async function scrapeIndiaBiz(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    // Load the page to establish the session, then read the XSRF-TOKEN cookie —
    // the /search/now POST requires it echoed back as an X-XSRF-TOKEN header.
    const seed = await context.newPage();
    await seed.goto(`${BASE}/business/business-opportunities-for-sale`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await seed.close();
    const xsrf = decodeURIComponent((await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value || '');

    // --- 1. List via /search/now (POST, page=N) ---
    const items: SearchItem[] = [];
    let page = 1;
    let total = Infinity;
    while (items.length < limit && (page - 1) * 9 < total) {
      let data: { result?: SearchItem[]; numFound?: number; more?: boolean };
      try {
        const res = await context.request.post(SEARCH_API, {
          form: { page: String(page), spellCheck: 'true', currency: 'INR', type: '1', ai_search: '0' },
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf },
          timeout: 30000,
        });
        if (!res.ok()) break;
        data = (await res.json()) as { result?: SearchItem[]; numFound?: number; more?: boolean };
      } catch {
        break;
      }
      const result = data.result || [];
      if (typeof data.numFound === 'number') total = data.numFound;
      if (result.length === 0) break;
      for (const it of result) {
        items.push(it);
        if (items.length >= limit) break;
      }
      if (data.more === false) break;
      page++;
      if (page % 20 === 0) console.log(`[IndiaBiz] listed ${items.length} (page ${page}/${Math.ceil(total / 9)})`);
    }
    console.log(`[IndiaBiz] listings: ${items.length}. Fetching detail pages…`);

    // --- 2. Detail enrichment (rich fields per listing) ---
    const extractDetail = (): Detail => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const f: Record<string, string> = {};
      document.querySelectorAll('.business-item-heading').forEach((h) => {
        const label = norm(h.textContent);
        const v = norm((h.parentElement as HTMLElement | null)?.querySelector('.label_center_val')?.textContent);
        if (label) f[label] = v;
      });
      const txt = document.body.innerText;
      // About / Reason: the real content is the section paragraph, NOT the nav-tab
      // labels (which an innerText regex picks up by mistake).
      const secText = (id: string) =>
        norm(document.querySelector(`#${id} .business-tab-details-content`)?.textContent);
      return {
        askingPriceExact: f['Asking Price'] || '',
        entityType: f['Entity Type'] || '',
        startedIn: f['Started In'] || '',
        turnover: f['Sales/Turnover'] || '',
        employees: f['Employees'] || '',
        operationalStatus: f['Operational Status'] || '',
        minTicket: (txt.match(/Minimum ticket size[^A-Za-z0-9]*([A-Z]{0,3}\s*[\d.,]+\s*(?:Cr|Crore|Lakh|Lac|L)?)/i) || [])[1] || '',
        about: secText('product_service'),
        reason: secText('reason_tab'),
      };
    };

    const details = new Map<string, Detail>();
    let idx = 0;
    const worker = async () => {
      const pp = await context.newPage();
      while (idx < items.length) {
        const it = items[idx++];
        if (!it.listing_url) continue;
        const url = `${BASE}/business/buy/${it.listing_url}`;
        try {
          const res = await context.request.get(url, { timeout: 30000 });
          if (!res.ok()) continue;
          await pp.setContent(SHIM_TAG + (await res.text()), { waitUntil: 'domcontentloaded' });
          details.set(String(it.id), (await pp.evaluate(extractDetail)) as Detail);
        } catch (e) {
          console.error(`[IndiaBiz] detail failed: ${url} — ${(e as Error).message}`);
        }
        if (idx % 100 === 0) console.log(`[IndiaBiz] detail ${idx}/${items.length}`);
      }
      await pp.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[IndiaBiz] details fetched: ${details.size}/${items.length}`);

    const thisYear = new Date().getFullYear();
    return items.map((it) => {
      const d = details.get(String(it.id));
      const year = d?.startedIn ? parseInt(d.startedIn, 10) : null;
      return {
        businessName: it.title || 'Unknown',
        address: null, city: it.city || null, state: it.state || null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [it.industry, it.subcategory].filter(Boolean) as string[],
        yearsInBusiness: year && year > 1900 ? thisYear - year : null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'indiabiz' as const,
        sourceUrl: it.listing_url ? `${BASE}/business/buy/${it.listing_url}` : BASE,
        mrr: null,
        askingPrice: parseINR(d?.askingPriceExact),
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseINR(d?.turnover), // often "Available on request" -> null
        annualProfit: null,
        forSale: true,
        founderName: null,
        foundedDate: d?.startedIn || null,
        rawData: {
          subcategory: it.subcategory ?? null,
          country: it.country ?? null,
          askingRange: it.asking_price ?? null,
          saleType: Array.isArray(it.sale_type) ? it.sale_type.join(', ') : null,
          description: it.product_service ?? null,
          gstVerified: !!it.gst_verified,
          vetted: !!it.vetted_status,
          featured: !!it.featured_listing,
          entityType: d?.entityType ?? null,
          startedIn: d?.startedIn ?? null,
          turnover: d?.turnover ?? null,
          employees: d?.employees ?? null,
          operationalStatus: d?.operationalStatus ?? null,
          minTicket: d?.minTicket ?? null,
          about: d?.about ?? null,
          reason: d?.reason ?? null,
        },
      };
    });
  } finally {
    await browser.close();
  }
}
