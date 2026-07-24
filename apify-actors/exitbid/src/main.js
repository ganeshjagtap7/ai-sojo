// ExitBid (exitbid.io) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/exitbid.ts to run on Apify instead of Vercel: it loads the
// SPA, intercepts the auctions JSON feed, maps each auction to a RawLead-shaped
// object, and pushes them to the dataset. Headless, no proxy (public, unprotected).
import { Actor } from 'apify';
import { chromium } from 'playwright';

const LIST_URL = 'https://exitbid.io/#auctions';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const dollars = (cents) => {
  const n = typeof cents === 'number' ? cents : parseFloat(String(cents));
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
};

// ExitBid is USD-only. Format a numeric amount exactly as the site lists it
// ("$2,450"). For multi-currency sources, pass that listing's own currency code.
const CURRENCY = 'USD';
const priceDisplay = (n, currency = CURRENCY) =>
  n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;

  const browser = await chromium.launch({ headless: true });
  let auctions = null;
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // Intercept the auctions feed: a JSON array whose items nest a `listings`
    // object and carry `current_bid`.
    page.on('response', async (resp) => {
      if (auctions) return;
      try {
        if (!/json/i.test(resp.headers()['content-type'] || '')) return;
        const j = await resp.json();
        if (Array.isArray(j) && j.length && j[0] && j[0].listings && 'current_bid' in j[0]) {
          auctions = j;
        }
      } catch {
        /* ignore non-JSON */
      }
    });

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 40 && !auctions; i++) await page.waitForTimeout(500);
  } finally {
    await browser.close();
  }

  if (!auctions) throw new Error('Could not capture the ExitBid auctions feed (site structure may have changed).');
  console.log(`[ExitBid] auctions: ${auctions.length}`);

  const leads = auctions.slice(0, maxItems).map((a) => {
    const L = a.listings || {};
    const currentBid = dollars(a.current_bid);
    const startingPrice = dollars(L.starting_price);
    const reserve = dollars(a.reserve_price);
    return {
      businessName: L.business_name || 'Unknown',
      address: null, city: null, state: null, zip: null, phone: null,
      website: L.website_url || null,
      googleRating: null, reviewCount: null,
      categories: [L.business_type, L.industry].filter(Boolean),
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null, bbbAccredited: null,
      source: 'exitbid',
      sourceUrl: L.id ? `https://exitbid.io/auction?id=${L.id}` : LIST_URL,
      currency: CURRENCY,
      priceDisplay: priceDisplay(currentBid && currentBid > 0 ? currentBid : startingPrice),
      mrr: null, // monthly_revenue is a range string (kept in rawData)
      askingPrice: currentBid && currentBid > 0 ? currentBid : startingPrice,
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: null,
      annualProfit: null,
      forSale: true,
      founderName: null,
      foundedDate: null,
      rawData: {
        slot: a.slot_number,
        businessType: L.business_type ?? null,
        industry: L.industry ?? null,
        stage: L.business_stage ?? null,
        oneLiner: L.one_liner ?? null,
        monthlyRevenue: L.monthly_revenue ?? null,
        expensesPercent: L.expenses_percent ?? null,
        users: L.users_count ?? null,
        businessAge: L.business_age ?? null,
        growthTrend: L.growth_trend ?? null,
        techStack: Array.isArray(L.tech_stack) ? L.tech_stack.join(', ') : null,
        startingPrice,
        currentBid,
        reserve,
        bidCount: a.bid_count ?? 0,
        endsAt: a.ends_at ?? null,
        sellingReason: L.selling_reason ?? null,
        idealBuyer: L.ideal_buyer_type ?? null,
        description: L.full_description ?? null,
      },
    };
  });

  await Actor.pushData(leads);
  console.log(`[ExitBid] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[ExitBid] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
