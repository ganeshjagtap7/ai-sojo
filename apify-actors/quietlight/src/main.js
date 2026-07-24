// Quiet Light (quietlight.com) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/quietlight.ts. Quiet Light sits behind Cloudflare's "Just a
// moment" check, so this runs a HEADED browser (Apify runs it under xvfb) through
// Apify's DATACENTER proxy to try clearing it for free. If Cloudflare still blocks
// the datacenter IP, switch to residential (see PROXY note below). USD.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const LISTINGS_URL = 'https://quietlight.com/listings/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

// Runs in the browser: extract all listing cards.
function extractCards() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const CATS = {
    'amazon-fba': 'Amazon FBA', ecommerce: 'Ecommerce', 'saas-software': 'SaaS',
    'content-site': 'Content', 'membership-coaching': 'Membership', sba: 'SBA Pre-Qualified', other: 'Other',
  };
  const out = [];
  document.querySelectorAll('.listing-card').forEach((card) => {
    const title = norm(card.querySelector('.listing-card__title')?.textContent);
    if (!title) return;
    const cls = card.className;
    const status = /\bsold\b/.test(cls) ? 'Recently Sold'
      : /under-loi|under-offer/.test(cls) ? 'Under Offer' : 'Available';
    let category = norm(card.querySelector('.listing-card__category')?.textContent);
    if (!category) {
      const key = Object.keys(CATS).find((k) => cls.split(/\s+/).includes(k));
      category = key ? CATS[key] : '';
    }
    const link = card.querySelector('a[href*="/listings/"]');
    const mult = title.match(/([\d.]+)\s*x\b/i);
    out.push({
      title, status, category,
      price: norm(card.querySelector('.listing-card__price')?.textContent),
      revenue: card.querySelector('[data-revenue]')?.getAttribute('data-revenue') || '',
      income: card.querySelector('[data-income]')?.getAttribute('data-income') || '',
      multiple: mult ? mult[1] : '',
      url: link ? link.href : null,
    });
  });
  return out;
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;

  // PROXY: datacenter by default (free). To use residential instead, deploy with
  // input { "residential": true } or change groups to ['RESIDENTIAL'] (paid).
  const proxyConfiguration = await Actor.createProxyConfiguration(
    input.residential ? { groups: ['RESIDENTIAL'], countryCode: 'US' } : undefined,
  );
  let proxy;
  if (proxyConfiguration) {
    const u = new URL(await proxyConfiguration.newUrl());
    proxy = {
      server: `${u.protocol}//${u.hostname}:${u.port}`,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
    console.log(`[QuietLight] using ${input.residential ? 'RESIDENTIAL' : 'datacenter'} proxy`);
  }

  const browser = await chromium.launch({ headless: false, proxy });
  let unique = [];
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
    await page.goto(LISTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait for Cloudflare to clear and the cards to render.
    await page.waitForSelector('.listing-card', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const cards = await page.evaluate(extractCards);
    await page.close();

    const byUrl = new Map();
    for (const c of cards) {
      const key = c.url || c.title;
      if (!byUrl.has(key)) byUrl.set(key, c);
    }
    unique = Array.from(byUrl.values()).slice(0, maxItems);
  } finally {
    await browser.close();
  }

  if (unique.length === 0) {
    console.log('[QuietLight] 0 listings — Cloudflare likely blocked the datacenter IP. Try residential.');
  }
  console.log(`[QuietLight] listings parsed: ${unique.length}`);

  const leads = unique.map((c) => {
    const askingPrice = /accepting offers/i.test(c.price) ? null : parseMoney(c.price);
    return {
      businessName: c.title,
      address: null, city: null, state: null, zip: null, phone: null, website: null,
      googleRating: null, reviewCount: null,
      categories: c.category ? [c.category] : [],
      yearsInBusiness: null, employeeCount: null,
      bbbRating: null, bbbAccredited: null,
      source: 'quietlight',
      sourceUrl: c.url ?? LISTINGS_URL,
      currency: CURRENCY,
      priceDisplay: priceDisplay(askingPrice),
      mrr: null,
      askingPrice,
      revenueMultiple: c.multiple ? parseFloat(c.multiple) : null,
      profitMultiple: null,
      annualRevenue: c.revenue ? parseInt(c.revenue, 10) : null,
      annualProfit: c.income ? parseInt(c.income, 10) : null, // QL "Income" = SDE/profit
      forSale: c.status !== 'Recently Sold',
      founderName: null,
      foundedDate: null,
      rawData: c,
    };
  });

  await Actor.pushData(leads);
  console.log(`[QuietLight] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[QuietLight] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
