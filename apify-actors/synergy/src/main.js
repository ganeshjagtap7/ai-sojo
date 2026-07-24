// Synergy Business Brokers (synergybb.com) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/synergy.ts: loads the FacetWP infinite-scroll list (stopping
// once maxItems unique cards are collected), enriches each from its detail page
// (EBITDA / employees / broker), maps to RawLead-shaped items. Headless. USD.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const LIST_URL = 'https://synergybb.com/businesses-for-sale/';
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
function parseInt0(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Runs in the browser: extract all currently-rendered list cards.
function extractCards() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('.sale-list-item').forEach((card) => {
    const a = card.querySelector('a.sale-list-item-title');
    const name = norm(a?.textContent);
    if (!name) return;
    let annualRevenue = '', netCashFlow = '';
    card.querySelectorAll('h5 span').forEach((s) => {
      const txt = norm(s.textContent);
      if (/annual revenue/i.test(txt)) annualRevenue = txt;
      else if (/net cash flow/i.test(txt)) netCashFlow = txt;
    });
    const industry = Array.from(card.querySelectorAll('.sale-list-category li a'))
      .map((x) => norm(x.textContent)).filter(Boolean).join(', ');
    out.push({
      name,
      url: a?.getAttribute('href') || '',
      asking: norm(card.querySelector('.sale-list-item-price')?.textContent),
      annualRevenue,
      netCashFlow,
      description: norm(card.querySelector('.sale-list-item-content-dsec')?.textContent),
      industry,
      location: norm(card.querySelector('.sale-list-location-btn h6')?.textContent),
    });
  });
  return out;
}

// Runs in the browser: extract the detail page's fields + broker contact.
function extractDetail() {
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const fields = {};
  document.querySelectorAll('.listing-info p').forEach((p) => {
    const strong = p.querySelector('strong');
    if (!strong) return;
    const label = norm(strong.textContent).replace(/:$/, '');
    const value = norm(p.textContent).replace(norm(strong.textContent), '').trim();
    if (label) fields[label] = value;
  });
  const h3 = document.querySelector('.broker-info-text h3');
  const title = norm(h3?.querySelector('span')?.textContent);
  const name = norm(h3?.textContent).replace(title, '').trim();
  const contact = document.querySelector('.broker-info-details-contact');
  const tel = contact?.querySelector('a[href^="tel:"]');
  const mail = contact?.querySelector('a[href^="mailto:"]');
  return {
    ebitda: fields['EBITDA'] || '',
    reasonForSale: fields['Reason For Sale'] || '',
    employees: fields['Employees'] || '',
    brokerName: name,
    brokerTitle: title,
    brokerPhone: norm(tel?.textContent),
    brokerEmail: (mail?.getAttribute('href') || '').replace(/^mailto:/, ''),
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
    const listPage = await context.newPage();
    await listPage.addInitScript(SHIM);
    await listPage.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await listPage.waitForSelector('.sale-list-item', { timeout: 30000 }).catch(() => {});

    // Load-more loop — stop once we have maxItems unique cards (or no new cards).
    const byUrl = new Map();
    let dry = 0;
    for (let i = 0; i < 500 && dry < 6 && byUrl.size < maxItems; i++) {
      const batch = await listPage.evaluate(extractCards);
      let added = 0;
      for (const c of batch) if (c.url && !byUrl.has(c.url)) { byUrl.set(c.url, c); added++; }
      dry = added > 0 ? 0 : dry + 1;

      const btn = listPage.locator('button.facetwp-load-more').first();
      if ((await btn.count()) === 0) {
        await listPage.waitForTimeout(1500);
        for (const c of await listPage.evaluate(extractCards)) {
          if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
        }
        break;
      }
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ timeout: 4000 }).catch(() => {});
      await listPage.waitForTimeout(2200);
    }
    await listPage.close();

    const list = Array.from(byUrl.values()).slice(0, maxItems);
    console.log(`[Synergy] listings: ${list.length} (cap ${maxItems}). Fetching detail pages…`);

    const details = new Map();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        try {
          await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('.listing-info', { timeout: 15000 }).catch(() => {});
          details.set(c.url, await page.evaluate(extractDetail));
        } catch (e) {
          console.error(`[Synergy] detail failed: ${c.url} — ${e.message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[Synergy] details fetched: ${details.size}/${list.length}`);

    leads = list.map((c) => {
      const d = details.get(c.url);
      const accepted = /accepted offer/i.test(`${c.name} ${c.description}`);
      const askingPrice = parseMoney(c.asking);
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: c.industry ? c.industry.split(',').map((s) => s.trim()) : [],
        yearsInBusiness: null,
        employeeCount: parseInt0(d?.employees),
        bbbRating: null, bbbAccredited: null,
        source: 'synergy',
        sourceUrl: c.url || LIST_URL,
        currency: CURRENCY,
        priceDisplay: priceDisplay(askingPrice),
        mrr: null,
        askingPrice,
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseMoney(c.annualRevenue),
        annualProfit: parseMoney(c.netCashFlow), // Net Cash Flow ≈ SDE
        forSale: !accepted,
        founderName: null,
        foundedDate: null,
        rawData: { ...c, ...d, status: accepted ? 'Has Accepted Offer' : 'Available' },
      };
    });
  } finally {
    await browser.close();
  }

  await Actor.pushData(leads);
  console.log(`[Synergy] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[Synergy] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
