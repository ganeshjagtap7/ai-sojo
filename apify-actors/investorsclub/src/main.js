// Investors Club (investors.club) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/investorsclub.ts: crawls list pages (capped by maxItems),
// enriches each from its detail page (gross revenue / revenue multiple), maps to
// RawLead-shaped items. Headless (Apify runs under xvfb). USD.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const LIST_URL = 'https://investors.club/listings/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const DETAIL_CONCURRENCY = 5;

const CURRENCY = 'USD';
const priceDisplay = (n, currency = CURRENCY) =>
  n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

function parseMoney(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\$?\s*([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function parseFloatish(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// Runs in the browser: extract listing cards from a list page.
function extractCards() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('.items-lstng').forEach((card) => {
    const titleEl = card.querySelector('h3.listing-title a');
    const name = norm(titleEl?.textContent);
    if (!name) return;
    const details = {};
    card.querySelectorAll('.listing-detail-item').forEach((it) => {
      const label = norm(it.querySelector('strong')?.textContent);
      const value = norm(it.querySelector('.tax-values')?.textContent);
      if (label) details[label] = value;
    });
    out.push({
      name,
      url: titleEl?.href || '',
      category: norm(card.querySelector('.category-tag')?.textContent),
      badge: norm(card.querySelector('.listing-category-badge')?.textContent),
      price: norm(card.querySelector('.listing-price')?.textContent).replace(/asking price/i, '').trim(),
      industry: details['Industry'] || '',
      netProfit: details['Annual Net Profit'] || '',
      profitMultiple: details['Profit Multiple'] || '',
      established: details['Established'] || '',
      monetization: details['Monetization'] || '',
    });
  });
  return out;
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;

  const browser = await chromium.launch({ headless: true });
  let leads = [];
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });

    // --- 1. Crawl list pages until we have maxItems cards (or a page is empty) ---
    const listPage = await context.newPage();
    await listPage.addInitScript(SHIM);
    const cards = [];
    for (let p = 1; p <= 15 && cards.length < maxItems; p++) {
      const url = p === 1 ? LIST_URL : `${LIST_URL}page/${p}/`;
      await listPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await listPage.waitForSelector('.items-lstng', { timeout: 20000 }).catch(() => {});
      const batch = await listPage.evaluate(extractCards);
      if (batch.length === 0) break;
      cards.push(...batch);
      console.log(`[InvestorsClub] list page ${p}: ${batch.length} cards (total ${cards.length})`);
    }
    await listPage.close();

    const byUrl = new Map();
    for (const c of cards) if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
    const list = Array.from(byUrl.values()).slice(0, maxItems);
    console.log(`[InvestorsClub] unique listings: ${list.length}. Fetching detail pages…`);

    // --- 2. Enrich each from its detail page: Gross Revenue + Revenue Multiple ---
    const details = new Map();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        try {
          await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('text=Annual Gross Revenue', { timeout: 20000 }).catch(() => {});
          const text = await page.evaluate(() => document.body.innerText);
          details.set(c.url, {
            grossRevenue: (text.match(/Annual Gross Revenue\s*\$?\s*([\d,]+)/i) || [])[1] || '',
            revenueMultiple: (text.match(/Revenue Multiple\s*([\d.]+)/i) || [])[1] || '',
          });
        } catch (e) {
          console.error(`[InvestorsClub] detail failed: ${c.url} — ${e.message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[InvestorsClub] details fetched: ${details.size}/${list.length}`);

    const thisYear = new Date().getFullYear();
    leads = list.map((c) => {
      const d = details.get(c.url);
      const year = c.established ? parseInt(c.established, 10) : null;
      const askingPrice = parseMoney(c.price);
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [c.category, c.industry].filter(Boolean),
        yearsInBusiness: year && year > 1900 ? thisYear - year : null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'investorsclub',
        sourceUrl: c.url || LIST_URL,
        currency: CURRENCY,
        priceDisplay: priceDisplay(askingPrice),
        mrr: null,
        askingPrice,
        revenueMultiple: parseFloatish(d?.revenueMultiple),
        profitMultiple: parseFloatish(c.profitMultiple),
        annualRevenue: parseMoney(d?.grossRevenue),
        annualProfit: parseMoney(c.netProfit),
        forSale: true,
        founderName: null,
        foundedDate: c.established || null,
        rawData: { ...c, ...d },
      };
    });
  } finally {
    await browser.close();
  }

  await Actor.pushData(leads);
  console.log(`[InvestorsClub] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[InvestorsClub] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
