// AppPeak (listings.apppeak.com/listings) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/apppeak.ts: loads the public board, extracts every
// server-rendered listing card, maps to RawLead-shaped items, pushes to dataset.
// Headless, no proxy. USD-only (prices are shown with "$").
import { Actor } from 'apify';
import { chromium } from 'playwright';

const LISTINGS_URL = 'https://listings.apppeak.com/listings';

const CURRENCY = 'USD';
const priceDisplay = (n, currency = CURRENCY) =>
  n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

// "$180,000", "$43,346", "4,410/mo", "N/A" -> number | null
function parseMoney(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'n/a' || s === '-') return null;
  let mult = 1;
  if (/\bb(illion)?\b/.test(s)) mult = 1e9;
  else if (/\bm(illion)?\b/.test(s)) mult = 1e6;
  else if (/\bk\b/.test(s)) mult = 1e3;
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

// "4.2", "8.0 Profit", "4.7/5", "56.5 years" -> leading float | null
function parseFloatish(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// Runs in the browser: extract every currently-rendered listing card.
function extract() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('h2').forEach((h2) => {
    const name = norm(h2.textContent);
    if (!name) return;
    // The full card is the nearest ancestor containing "Annual Revenue".
    let card = h2.parentElement;
    for (let up = 0; up < 10 && card; up++) {
      if (/Annual Revenue/.test(card.textContent || '')) break;
      card = card.parentElement;
    }
    if (!card || card.querySelectorAll('h2').length !== 1) return;
    const scope = card;
    const cardText = norm(scope.innerText);
    const valOf = (label) => {
      const nodes = Array.from(scope.querySelectorAll('span'));
      for (const n of nodes) {
        if (norm(n.textContent) === label) return norm(n.nextElementSibling?.textContent);
      }
      return '';
    };
    const mul = cardText.match(/Multiple:\s*([\d.]+)\s*Revenue\s*([\d.]+)\s*Profit/i);
    const desc = norm(scope.querySelector('[class*="line-clamp"]')?.textContent);
    const img = scope.querySelector('img');
    const thumbId = img ? (img.src.match(/preview_img\/(\d+)/) || [])[1] || null : null;
    const soldPrice = valOf('Sold');
    const price = valOf('Asking Price') || soldPrice;
    out.push({
      name,
      description: desc,
      askingPrice: price,
      revenueMultiple: mul ? mul[1] : '',
      profitMultiple: mul ? mul[2] : '',
      category: valOf('Category'),
      rating: valOf('Rating'),
      age: valOf('Age'),
      annualRevenue: valOf('Annual Revenue'),
      annualProfit: valOf('Annual Profit'),
      downloads: valOf('Downloads'),
      platforms: ['iOS', 'Android'].filter((p) => new RegExp(`\\b${p}\\b`).test(cardText)),
      hotDeal: /Hot Deal/.test(cardText),
      sold: !!soldPrice,
      thumbId,
    });
  });
  return out;
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;

  const browser = await chromium.launch({ headless: true });
  let cards = [];
  try {
    const page = await browser.newPage();
    await page.goto(LISTINGS_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Asking Price', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const batch = await page.evaluate(extract);
    const byName = new Map();
    for (const c of batch) if (c.name && !byName.has(c.name)) byName.set(c.name, c);
    cards = Array.from(byName.values());
  } finally {
    await browser.close();
  }

  console.log(`[AppPeak] listings parsed: ${cards.length}`);

  const leads = cards.slice(0, maxItems).map((c) => {
    const askingPrice = parseMoney(c.askingPrice);
    return {
      businessName: c.name,
      address: null, city: null, state: null, zip: null, phone: null, website: null,
      googleRating: parseFloatish(c.rating), // "4.7/5" -> 4.7
      reviewCount: null,
      categories: [c.category, ...c.platforms].filter(Boolean),
      yearsInBusiness: parseFloatish(c.age), // "56.5 years" -> 56.5
      employeeCount: null,
      bbbRating: null, bbbAccredited: null,
      source: 'apppeak',
      sourceUrl: LISTINGS_URL,
      currency: CURRENCY,
      priceDisplay: priceDisplay(askingPrice),
      mrr: null,
      askingPrice,
      revenueMultiple: parseFloatish(c.revenueMultiple),
      profitMultiple: parseFloatish(c.profitMultiple),
      annualRevenue: parseMoney(c.annualRevenue),
      annualProfit: parseMoney(c.annualProfit),
      forSale: !c.sold, // a sold listing is no longer for sale
      founderName: null,
      foundedDate: null,
      rawData: c, // keeps downloads, platforms, hotDeal, thumbId
    };
  });

  await Actor.pushData(leads);
  console.log(`[AppPeak] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[AppPeak] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
