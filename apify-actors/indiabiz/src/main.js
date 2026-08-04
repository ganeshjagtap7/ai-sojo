// IndiaBizForSale (indiabizforsale.com) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/indiabiz.ts: seeds an XSRF token, lists via the /search/now
// POST API (capped by maxItems so we never fetch the whole ~16k catalogue),
// enriches each listing from its detail page, maps to RawLead-shaped items.
// Headless, no proxy. INR currency.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const BASE = 'https://www.indiabizforsale.com';
const SEARCH_API = `${BASE}/search/now`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM_TAG = '<script>globalThis.__name=globalThis.__name||function(f){return f};</script>';
const DETAIL_CONCURRENCY = 5;

const CURRENCY = 'INR';
const priceDisplay = (n, currency = CURRENCY) =>
  n == null ? null : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

// "INR 35.00 Cr", "INR 30.00 L", "10-50 Lakh" -> rupees.
function parseINR(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/,/g, '');
  // A dash range like "10-50 Lakh" carries ONE trailing unit that applies to
  // both numbers; the plain match would grab "10" with no unit and return 10
  // instead of 1,000,000. Detect the range and attach the unit to the lower bound.
  const range = s.match(/([\d.]+)\s*-\s*[\d.]+\s*(crore|cr|lakh|lac|l|k)\b/);
  const m = range || s.match(/([\d.]+)\s*(crore|cr|lakh|lac|l|k)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2] || '';
  if (u === 'crore' || u === 'cr') return Math.round(n * 1e7);
  if (u === 'lakh' || u === 'lac' || u === 'l') return Math.round(n * 1e5);
  if (u === 'k') return Math.round(n * 1e3);
  return Math.round(n);
}

// Runs in the browser: extract the rich detail fields from a listing page.
function extractDetail() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const f = {};
  document.querySelectorAll('.business-item-heading').forEach((h) => {
    const label = norm(h.textContent);
    const v = norm(h.parentElement?.querySelector('.label_center_val')?.textContent);
    if (label) f[label] = v;
  });
  const txt = document.body.innerText;
  const secText = (id) => norm(document.querySelector(`#${id} .business-tab-details-content`)?.textContent);
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
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;

  const browser = await chromium.launch({ headless: true });
  let leads = [];
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });

    // Seed the session, then read the XSRF-TOKEN cookie the /search/now POST needs.
    const seed = await context.newPage();
    await seed.goto(`${BASE}/business/business-opportunities-for-sale`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await seed.close();
    const xsrf = decodeURIComponent((await context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value || '');

    // --- 1. List via /search/now (POST, page=N), capped at maxItems ---
    const items = [];
    let page = 1;
    let total = Infinity;
    while (items.length < maxItems && (page - 1) * 9 < total) {
      let data;
      try {
        const res = await context.request.post(SEARCH_API, {
          form: { page: String(page), spellCheck: 'true', currency: 'INR', type: '1', ai_search: '0' },
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf },
          timeout: 30000,
        });
        if (!res.ok()) break;
        data = await res.json();
      } catch {
        break;
      }
      const result = data.result || [];
      if (typeof data.numFound === 'number') total = data.numFound;
      if (result.length === 0) break;
      for (const it of result) {
        items.push(it);
        if (items.length >= maxItems) break;
      }
      if (data.more === false) break;
      page++;
    }
    console.log(`[IndiaBiz] listings: ${items.length} (cap ${maxItems}). Fetching detail pages…`);

    // --- 2. Detail enrichment (rich fields per listing) ---
    const details = new Map();
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
          details.set(String(it.id), await pp.evaluate(extractDetail));
        } catch (e) {
          console.error(`[IndiaBiz] detail failed: ${url} — ${e.message}`);
        }
      }
      await pp.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[IndiaBiz] details fetched: ${details.size}/${items.length}`);

    const thisYear = new Date().getFullYear();
    leads = items.map((it) => {
      const d = details.get(String(it.id));
      const year = d?.startedIn ? parseInt(d.startedIn, 10) : null;
      const askingPrice = parseINR(d?.askingPriceExact);
      return {
        businessName: it.title || 'Unknown',
        address: null, city: it.city || null, state: it.state || null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [it.industry, it.subcategory].filter(Boolean),
        yearsInBusiness: year && year > 1900 ? thisYear - year : null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'indiabiz',
        sourceUrl: it.listing_url ? `${BASE}/business/buy/${it.listing_url}` : BASE,
        currency: CURRENCY,
        priceDisplay: priceDisplay(askingPrice),
        mrr: null,
        askingPrice,
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseINR(d?.turnover),
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

  await Actor.pushData(leads);
  console.log(`[IndiaBiz] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[IndiaBiz] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
