// ⚠️ LOCAL-ONLY (Phase 1). Uses Playwright; do NOT import into the app / pipeline.
// See scripts/test-exitbid.ts.
//
// ExitBid (exitbid.io) — PUBLIC auction marketplace for small digital businesses
// (~12-14 live auctions). It's a SPA that fetches the auctions feed as JSON; we
// load the page and intercept that response (each auction nests the full listing
// detail). Prices are in CENTS. No login, no per-detail visits needed.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const LIST_URL = 'https://exitbid.io/#auctions';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const dollars = (cents: unknown): number | null => {
  const n = typeof cents === 'number' ? cents : parseFloat(String(cents));
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
};

interface Listing {
  id?: string;
  business_name?: string;
  business_type?: string;
  industry?: string;
  business_stage?: string;
  one_liner?: string;
  monthly_revenue?: string;
  expenses_percent?: string | number;
  users_count?: string;
  business_age?: string;
  growth_trend?: string;
  full_description?: string;
  starting_price?: number;
  tech_stack?: string[];
  website_url?: string;
  selling_reason?: string;
  ideal_buyer_type?: string;
}
interface Auction {
  slot_number?: number;
  ends_at?: string;
  current_bid?: number;
  bid_count?: number;
  reserve_price?: number;
  listings?: Listing;
}

export async function scrapeExitBid(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // Intercept the auctions feed: a JSON array whose items nest a `listings`
    // object and carry `current_bid`.
    let auctions: Auction[] | null = null;
    page.on('response', async (resp) => {
      if (auctions) return;
      try {
        if (!/json/i.test(resp.headers()['content-type'] || '')) return;
        const j = await resp.json();
        if (Array.isArray(j) && j.length && j[0] && j[0].listings && 'current_bid' in j[0]) {
          auctions = j as Auction[];
        }
      } catch { /* ignore non-JSON */ }
    });

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 40 && !auctions; i++) await page.waitForTimeout(500);
    await page.close();

    if (!auctions) throw new Error('Could not capture the ExitBid auctions feed (site structure may have changed).');
    const list: Auction[] = auctions;
    console.log(`[ExitBid] auctions: ${list.length}`);

    return list.map((a) => {
      const L = a.listings || {};
      const currentBid = dollars(a.current_bid);
      const startingPrice = dollars(L.starting_price);
      const reserve = dollars(a.reserve_price);
      return {
        businessName: L.business_name || 'Unknown',
        address: null, city: null, state: null, zip: null, phone: null,
        website: L.website_url || null,
        googleRating: null, reviewCount: null,
        categories: [L.business_type, L.industry].filter(Boolean) as string[],
        yearsInBusiness: null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'exitbid' as const,
        sourceUrl: L.id ? `https://exitbid.io/auction?id=${L.id}` : LIST_URL,
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
  } finally {
    await browser.close();
  }
}
