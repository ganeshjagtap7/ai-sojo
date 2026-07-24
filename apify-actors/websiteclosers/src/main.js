// Website Closers (websiteclosers.com) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/websiteclosers.ts: crawls list pages (capped by maxItems so
// we never sweep all ~280 pages), enriches each listing from its detail page,
// maps to RawLead-shaped items. Headless (Apify runs it under xvfb). USD.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const LIST_URL = 'https://www.websiteclosers.com/businesses-for-sale/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const DETAIL_CONCURRENCY = 5;

const CURRENCY = 'USD';
const priceDisplay = (n, currency = CURRENCY) =>
  n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

async function gotoRetry(page, url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return true;
    } catch {
      console.error(`[WebsiteClosers] goto failed (attempt ${i + 1}/${attempts}): ${url}`);
      if (i < attempts - 1) await page.waitForTimeout(3000);
    }
  }
  return false;
}

function parseMoney(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\$?\s*([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
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
    for (let p = 1; p <= 60 && cards.length < maxItems; p++) {
      const url = p === 1 ? LIST_URL : `${LIST_URL}page/${p}/`;
      const ok = await gotoRetry(listPage, url);
      if (!ok) {
        if (p === 1) throw new Error('Could not load the Website Closers list page.');
        break;
      }
      await listPage.waitForSelector('.post_item', { timeout: 15000 }).catch(() => {});
      const batch = await listPage.evaluate(() => {
        const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
        const out = [];
        document.querySelectorAll('.post_item').forEach((card) => {
          const titleEl = card.querySelector('a.post_title');
          const title = norm(titleEl?.textContent);
          if (!title) return;
          out.push({
            title,
            url: titleEl?.getAttribute('href') || '',
            status: norm(card.querySelector('.badge')?.textContent),
            description: norm(card.querySelector('.the_content')?.textContent),
            asking: norm(card.querySelector('.asking_price strong')?.textContent),
            cash: norm(card.querySelector('.cash_flow strong')?.textContent),
          });
        });
        return out;
      });
      if (batch.length === 0) break;
      cards.push(...batch);
      console.log(`[WebsiteClosers] list page ${p}: ${batch.length} cards (total ${cards.length})`);
    }
    await listPage.close();

    const byUrl = new Map();
    for (const c of cards) if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
    const list = Array.from(byUrl.values()).slice(0, maxItems);
    console.log(`[WebsiteClosers] unique listings: ${list.length}. Fetching detail pages…`);

    // --- 2. Enrich each listing from its detail page ---
    const details = new Map();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        try {
          if (!(await gotoRetry(page, c.url, 2))) continue;
          await page.waitForSelector('.sb-table', { timeout: 15000 }).catch(() => {});
          const d = await page.evaluate(() => {
            const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
            const map = {};
            document.querySelectorAll('.sb-table .line').forEach((line) => {
              const label = norm(line.querySelector('.left')?.textContent);
              const value = norm(line.querySelector('.right')?.textContent);
              if (label) map[label] = value;
            });
            const wc = (document.body.innerText.match(/WC\s*\d{2,}/) || [])[0] || '';
            return {
              grossIncome: map['Gross Income'] || '',
              yearEstablished: map['Year Established'] || '',
              wcCode: wc,
            };
          });
          details.set(c.url, d);
        } catch (e) {
          console.error(`[WebsiteClosers] detail failed: ${c.url} — ${e.message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[WebsiteClosers] details fetched: ${details.size}/${list.length}`);

    const thisYear = new Date().getFullYear();
    leads = list.map((c) => {
      const d = details.get(c.url);
      const year = d?.yearEstablished ? parseInt(d.yearEstablished, 10) : null;
      const askingPrice = parseMoney(c.asking);
      return {
        businessName: c.title,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [],
        yearsInBusiness: year && year > 1900 ? thisYear - year : null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'websiteclosers',
        sourceUrl: c.url || LIST_URL,
        currency: CURRENCY,
        priceDisplay: priceDisplay(askingPrice),
        mrr: null,
        askingPrice,
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseMoney(d?.grossIncome),
        annualProfit: parseMoney(c.cash),
        forSale: !/sold/i.test(c.status),
        founderName: null,
        foundedDate: d?.yearEstablished || null,
        rawData: { ...c, ...d },
      };
    });
  } finally {
    await browser.close();
  }

  await Actor.pushData(leads);
  console.log(`[WebsiteClosers] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[WebsiteClosers] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
