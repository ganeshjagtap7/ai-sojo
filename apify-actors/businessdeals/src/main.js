// BusinessDeals.in — self-owned Apify actor (Phase 4).
// Ports lib/scraping/businessdeals.ts: reads the Laravel CSRF token, pages the
// AJAX listing endpoint (capped by maxItems so we never pull the whole ~5,542),
// enriches each listing from its detail page, maps to RawLead-shaped items.
// Headless, no proxy. MULTI-CURRENCY: each listing carries its own USD/INR
// (shown as an icon on the site), used for that row's priceDisplay.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const BASE = 'https://businessdeals.in';
const LIST_URL = `${BASE}/businesses-for-sale-and-investment-opportunities`;
const FETCH_URL = `${BASE}/pagination/fetch_data`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const shimTag = '<script>globalThis.__name=globalThis.__name||function(f){return f};</script>';
const PAGE_SIZE = 10;

// Format an amount in the listing's own currency ("$500,000" / "₹3,50,00,000").
const priceDisplay = (n, currency) => {
  if (n == null) return null;
  const cur = currency || 'INR';
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
};

// "35 Crs", "40 Lacs", "150 Thousand" -> absolute amount (currency-agnostic).
function parseAmount(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase().replace(/,/g, '');
  const m = s.match(/([\d.]+)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/billion|\bbn\b/.test(s)) n *= 1e9;
  else if (/crore|\bcr/.test(s)) n *= 1e7;
  else if (/million|\bmn\b/.test(s)) n *= 1e6;
  else if (/lac|lakh/.test(s)) n *= 1e5;
  else if (/thousand|\bk\b/.test(s)) n *= 1e3;
  return Math.round(n);
}

// Runs in the browser: parse listing cards from a page's row fragment.
function extract() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('h4.text-primary').forEach((h4) => {
    const name = norm(h4.textContent);
    if (!name) return;
    const a = h4.closest('a');
    const card = h4.closest('.card') || h4.parentElement?.parentElement || null;
    if (!card) return;
    const loc = card.querySelector('.fa-map-marker')?.parentElement;
    const h6s = Array.from(card.querySelectorAll('.card-footer h6')).map((x) => norm(x.textContent));
    const askEl = card.querySelector('.card-footer .text-danger');
    let currency = '';
    if (askEl?.querySelector('.fa-usd, .fa-dollar, .fa-dollar-sign')) currency = 'USD';
    else if (askEl?.querySelector('.fa-inr, .fa-rupee, .fa-rupee-sign')) currency = 'INR';
    out.push({
      name,
      url: a?.getAttribute('href') || '',
      location: norm(loc?.textContent),
      description: norm(card.querySelector('p.leading-tight')?.textContent),
      type: h6s[0] || '',
      category: h6s[1] || '',
      asking: norm(askEl?.textContent),
      currency,
    });
  });
  return out;
}

// Runs in the browser: parse the detail page's label/value table.
function extractDetail() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const fields = {};
  document.querySelectorAll('tr').forEach((tr) => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 2) return;
    const label = norm(tds[0].textContent);
    if (!label) return;
    const v = tds[1];
    let cur = '';
    if (v.querySelector('.fa-usd, .fa-dollar, .fa-dollar-sign')) cur = 'USD';
    else if (v.querySelector('.fa-inr, .fa-rupee, .fa-rupee-sign')) cur = 'INR';
    fields[label] = { value: norm(v.textContent), currency: cur };
  });
  return {
    turnover: fields['Turnover']?.value || '',
    turnoverCurrency: fields['Turnover']?.currency || '',
    legalEntity: fields['Legal Entity']?.value || '',
    subCategory: fields['Sub Category']?.value || '',
    listedBy: fields['Business Listed By']?.value || '',
  };
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;
  const pagesNeeded = Math.ceil(maxItems / PAGE_SIZE);

  const browser = await chromium.launch({ headless: true });
  let leads = [];
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(SHIM);
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const token = await page.evaluate(
      () =>
        document.querySelector('meta[name="_token"]')?.getAttribute('content') ||
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
        document.querySelector('input[name="_token"]')?.value ||
        '',
    );
    await page.close();
    if (!token) throw new Error('Could not read CSRF _token from BusinessDeals page');

    const form = {
      action: 'fetch_data', PageSize: String(PAGE_SIZE), SortBy: 'Modified',
      keyword: '', priceRangeMin: '', priceRangeMax: '', listingAge: '', outsideIndia: '', _token: token,
    };
    const fetchPage = async (p) => {
      for (let i = 0; i < 3; i++) {
        try {
          const res = await context.request.post(`${FETCH_URL}?page=${p}`, {
            form, headers: { 'x-requested-with': 'XMLHttpRequest' }, timeout: 30000,
          });
          if (res.ok()) return await res.json();
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      return {};
    };

    // Page-capped: fetch only enough pages to cover maxItems.
    const first = await fetchPage(1);
    const maxPage = Math.max(
      1,
      ...[...String(first.pagination_link || '').matchAll(/page=(\d+)/g)].map((m) => parseInt(m[1], 10)),
    );
    const lastPage = Math.min(maxPage, pagesNeeded);
    console.log(`[BusinessDeals] fetching ${lastPage}/${maxPage} pages (cap ${maxItems} items)…`);

    const listingHtml = new Map();
    listingHtml.set(1, first.listing || '');
    for (let p = 2; p <= lastPage; p++) {
      const j = await fetchPage(p);
      listingHtml.set(p, j.listing || '');
    }

    // Parse each page's fragment into cards.
    const parsePage = await context.newPage();
    const byUrl = new Map();
    for (const p of [...listingHtml.keys()].sort((a, b) => a - b)) {
      const html = listingHtml.get(p);
      if (!html) continue;
      await parsePage.setContent(shimTag + html, { waitUntil: 'domcontentloaded' });
      const cards = await parsePage.evaluate(extract);
      for (const c of cards) {
        const key = c.url || c.name;
        if (key && !byUrl.has(key)) byUrl.set(key, c);
      }
    }
    await parsePage.close();

    const list = Array.from(byUrl.values()).slice(0, maxItems);
    console.log(`[BusinessDeals] listings: ${list.length}. Fetching detail pages…`);

    // Detail enrichment (Turnover, Legal Entity, Sub Category…).
    const details = new Map();
    let di = 0;
    const detailWorker = async () => {
      const pp = await context.newPage();
      while (di < list.length) {
        const c = list[di++];
        if (!c.url) continue;
        let html = '';
        for (let i = 0; i < 3 && !html; i++) {
          try {
            const res = await context.request.get(c.url, { timeout: 30000 });
            if (res.ok()) html = await res.text();
          } catch { /* retry */ }
          if (!html) await new Promise((r) => setTimeout(r, 800));
        }
        if (!html) continue;
        try {
          await pp.setContent(shimTag + html, { waitUntil: 'domcontentloaded' });
          details.set(c.url, await pp.evaluate(extractDetail));
        } catch (e) {
          console.error(`[BusinessDeals] detail parse failed: ${c.url} — ${e.message}`);
        }
      }
      await pp.close();
    };
    await Promise.all(Array.from({ length: 6 }, () => detailWorker()));
    console.log(`[BusinessDeals] details fetched: ${details.size}/${list.length}`);

    leads = list.map((c) => {
      const d = details.get(c.url);
      const askingPrice = parseAmount(c.asking);
      const currency = c.currency || 'INR';
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [c.category, d?.subCategory].filter(Boolean),
        yearsInBusiness: null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'businessdeals',
        sourceUrl: c.url || LIST_URL,
        currency,
        priceDisplay: priceDisplay(askingPrice, currency),
        mrr: null,
        askingPrice,
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseAmount(d?.turnover), // Turnover ≈ annual revenue
        annualProfit: null,
        forSale: /sale/i.test(c.type),
        founderName: null,
        foundedDate: null,
        rawData: { ...c, ...d },
      };
    });
  } finally {
    await browser.close();
  }

  await Actor.pushData(leads);
  console.log(`[BusinessDeals] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[BusinessDeals] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
