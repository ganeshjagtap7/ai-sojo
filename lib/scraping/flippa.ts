import { ApifyClient } from 'apify-client';
import { RawLead, SearchCriteria } from '@/lib/types';
import { assertPublicSource, cappedMaxResults } from '@/lib/scraping/scrapingPolicy';
import { detectCurrency } from '@/lib/money';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// parseforge/flippa-scraper — Flippa (global marketplace for online businesses:
// SaaS, apps, ecommerce, content, domains). Filters server-side by keyword and
// price. Output reports MONTHLY revenue/profit (revenueAverage / profitAverage)
// plus revenue and profit multiples; prices are USD.
const FLIPPA_ACTOR = 'parseforge/flippa-scraper';

/** Coerce a money/number field (number, or string with $ / commas) to a number. */
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.replace(/[$,]/g, '').match(/\d+(\.\d+)?/);
    return m ? Math.round(parseFloat(m[0]) * 100) / 100 : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Like num() but treats 0 as absent — Flippa reports 0 for "not disclosed"
 *  (pre-revenue listings, confidential price), so 0 would render misleading
 *  "$0" / "0×" rows. Returns null for 0/negative/missing. */
function pos(v: unknown): number | null {
  const n = num(v);
  return n && n > 0 ? n : null;
}

/** Flippa can't filter by location (no location input), so results are global —
 *  but each listing discloses where it's based in `country`, e.g.
 *  "CA, United States" (a US state) or "India". We capture the US state so the
 *  ranker floats the buyer's target location to the top; non-US stays null. */
function flippaState(country: unknown): string | null {
  const c = str(country);
  if (!c) return null;
  const m = c.match(/^([A-Za-z]{2}),\s*United States$/);
  return m ? m[1].toUpperCase() : null;
}

/** Build the actor input from criteria. Only keyword + price filters are passed:
 *  Flippa's revenue filter is monthly while our band is annual, so we omit it
 *  and let the ranker judge revenue fit downstream. */
export function buildInput(criteria: SearchCriteria): Record<string, unknown> {
  const input: Record<string, unknown> = {
    maxItems: cappedMaxResults(parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50', 10)),
  };
  const q = criteria.industry.primary;
  if (q && !/^business services$/i.test(q.trim())) input.searchQuery = q;
  const { priceMin, priceMax } = criteria.businessSize;
  if (priceMin) input.priceMin = priceMin;
  if (priceMax) input.priceMax = priceMax;
  return input;
}

/** Map raw Flippa dataset items to RawLead — online-business deal fields; the
 *  full item is kept in rawData. Monthly revenue/profit are annualized for
 *  cross-source comparability, with the monthly figure kept as mrr. */
export function mapItems(items: Record<string, unknown>[]): RawLead[] {
  return items.map((item) => {
    const monthlyRev = pos(item.revenueAverage);
    const cats = [str(item.propertyType), str(item.category)].filter(Boolean) as string[];
    return {
      businessName: str(item.title) || 'Unknown',
      address: null,
      city: null, // Flippa gives no city (online business); only country/state
      state: flippaState(item.country), // US state when disclosed, for location ranking
      zip: null,
      phone: null,
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: cats,
      yearsInBusiness: num(item.establishedAt),
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'flippa' as const,
      sourceUrl: str(item.url),
      askingPrice: pos(item.price),
      // Flippa lists MONTHLY figures — show exactly that as MRR; don't derive an
      // annual number. The revenue/profit multiples (as listed) convey scale.
      mrr: monthlyRev,
      annualRevenue: null,
      annualProfit: null,
      revenueMultiple: pos(item.revenueMultiple),
      profitMultiple: pos(item.multiple),
      currency: detectCurrency(str(item.currencyLabel)) || 'USD',
      forSale: true,
      foundedDate: null,
      rawData: item,
    };
  });
}

export async function scrapeFlippa(criteria: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('flippa');
  const input = buildInput(criteria);

  let runId = 'unknown';
  try {
    const run = await client.actor(FLIPPA_ACTOR).call(input, { waitSecs: 180 });
    runId = run.id;
    console.log(`[Flippa] run id=${run.id} status=${run.status} input=${JSON.stringify(input)}`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const arr = items as Record<string, unknown>[];
    console.log(`[Flippa] total items returned: ${arr.length}`);
    return mapItems(arr);
  } catch (err) {
    console.error(`[Flippa] run id=${runId} failed:`, err);
    throw err;
  }
}
