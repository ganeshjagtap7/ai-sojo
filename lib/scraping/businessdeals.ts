// ⚠️ LOCAL-ONLY (Phase 1). Uses Playwright; do NOT import into the app / pipeline.
// See scripts/test-businessdeals.ts.
//
// BusinessDeals.in — PUBLIC India SME marketplace (~5,542 listings). Listings are
// paginated via a Laravel AJAX endpoint: POST /pagination/fetch_data?page=N with a
// CSRF _token + the session cookie, returning JSON { listing, pagination_link }.
// We read the token from the page, then replay the POST for every page (no per-row
// browser render). List-row fields only (no detail visits).

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://businessdeals.in';
const LIST_URL = `${BASE}/businesses-for-sale-and-investment-opportunities`;
const FETCH_URL = `${BASE}/pagination/fetch_data`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const FETCH_CONCURRENCY = 6;

// "35 Crs", "40 Lacs", "150 Thousand" -> absolute amount (currency-agnostic).
// Indian + international units: Thousand 1e3, Lac/Lakh 1e5, Million 1e6,
// Crore/Cr 1e7, Billion 1e9.
function parseAmount(raw: unknown): number | null {
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

interface BDCard {
  name: string;
  url: string;
  location: string;
  description: string;
  type: string;
  category: string;
  asking: string;
  currency: string;
}

export async function scrapeBusinessDeals(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(SHIM);
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Laravel CSRF token (used in the pagination POST body).
    const token = await page.evaluate(
      () =>
        document.querySelector('meta[name="_token"]')?.getAttribute('content') ||
        document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
        (document.querySelector('input[name="_token"]') as HTMLInputElement | null)?.value ||
        '',
    );
    await page.close();
    if (!token) throw new Error('Could not read CSRF _token from BusinessDeals page');

    const form = {
      action: 'fetch_data', PageSize: '10', SortBy: 'Modified',
      keyword: '', priceRangeMin: '', priceRangeMax: '', listingAge: '', outsideIndia: '', _token: token,
    };
    const fetchPage = async (p: number): Promise<string> => {
      for (let i = 0; i < 3; i++) {
        try {
          const res = await context.request.post(`${FETCH_URL}?page=${p}`, {
            form, headers: { 'x-requested-with': 'XMLHttpRequest' }, timeout: 30000,
          });
          if (res.ok()) {
            const j = (await res.json()) as { listing?: string; pagination_link?: string };
            return JSON.stringify(j);
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      return '';
    };

    // Page 1 → also gives us the last page number from pagination_link.
    const first = JSON.parse((await fetchPage(1)) || '{}') as { listing?: string; pagination_link?: string };
    const maxPage = Math.max(
      1,
      ...[...String(first.pagination_link || '').matchAll(/page=(\d+)/g)].map((m) => parseInt(m[1], 10)),
    );
    console.log(`[BusinessDeals] ${maxPage} pages to fetch…`);

    const listingHtml = new Map<number, string>();
    listingHtml.set(1, first.listing || '');
    const pages: number[] = [];
    for (let p = 2; p <= maxPage; p++) pages.push(p);
    let idx = 0;
    const worker = async () => {
      while (idx < pages.length) {
        const p = pages[idx++];
        const body = await fetchPage(p);
        try { listingHtml.set(p, (JSON.parse(body || '{}') as { listing?: string }).listing || ''); } catch { /* skip */ }
        if (p % 50 === 0) console.log(`[BusinessDeals] fetched page ${p}/${maxPage}`);
      }
    };
    await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, () => worker()));

    // Parse each page's row fragment (load into a page; querySelector the cards).
    const extract = (): BDCard[] => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const out: BDCard[] = [];
      document.querySelectorAll('h4.text-primary').forEach((h4El) => {
        const h4 = h4El as HTMLElement;
        const name = norm(h4.textContent);
        if (!name) return;
        const a = h4.closest('a') as HTMLAnchorElement | null;
        const card = (h4.closest('.card') as HTMLElement | null) || h4.parentElement?.parentElement || null;
        if (!card) return;
        const loc = card.querySelector('.fa-map-marker')?.parentElement;
        const h6s = Array.from(card.querySelectorAll('.card-footer h6')).map((x) => norm(x.textContent));
        // Currency is shown as an icon (fa-usd / fa-inr), not text.
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
    };

    const parsePage = await context.newPage();
    // Prepend the __name shim as an inline script so it's defined before evaluate
    // runs (addInitScript doesn't reliably apply to setContent).
    const shimTag = '<script>globalThis.__name=globalThis.__name||function(f){return f};</script>';
    const byUrl = new Map<string, BDCard>();
    for (const p of [...listingHtml.keys()].sort((a, b) => a - b)) {
      const html = listingHtml.get(p);
      if (!html) continue;
      await parsePage.setContent(shimTag + html, { waitUntil: 'domcontentloaded' });
      const cards = (await parsePage.evaluate(extract)) as BDCard[];
      for (const c of cards) {
        const key = c.url || c.name;
        if (key && !byUrl.has(key)) byUrl.set(key, c);
      }
    }
    await parsePage.close();

    const list = Array.from(byUrl.values());
    console.log(`[BusinessDeals] listings: ${list.length}. Fetching detail pages…`);

    // Detail enrichment: each detail page is server-rendered with a
    // <tr><td>Label</td><td>value</td></tr> table (Turnover, Legal Entity, etc.).
    const extractDetail = () => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const fields: Record<string, { value: string; currency: string }> = {};
      document.querySelectorAll('tr').forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 2) return;
        const label = norm(tds[0].textContent);
        if (!label) return;
        const v = tds[1] as HTMLElement;
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
    };
    type BDDetail = ReturnType<typeof extractDetail>;

    const details = new Map<string, BDDetail>();
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
          details.set(c.url, (await pp.evaluate(extractDetail)) as BDDetail);
        } catch (e) {
          console.error(`[BusinessDeals] detail parse failed: ${c.url} — ${(e as Error).message}`);
        }
        if (di % 200 === 0) console.log(`[BusinessDeals] detail ${di}/${list.length}`);
      }
      await pp.close();
    };
    await Promise.all(Array.from({ length: 6 }, () => detailWorker()));
    console.log(`[BusinessDeals] details fetched: ${details.size}/${list.length}`);

    return list.map((c) => {
      const d = details.get(c.url);
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [c.category, d?.subCategory].filter(Boolean) as string[],
        yearsInBusiness: null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'businessdeals' as const,
        sourceUrl: c.url || LIST_URL,
        mrr: null,
        askingPrice: parseAmount(c.asking),
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
}
