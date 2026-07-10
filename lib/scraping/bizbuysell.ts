import { ApifyClient } from 'apify-client';
import { RawLead, SearchCriteria } from '@/lib/types';
import { assertPublicSource, cappedMaxResults } from '@/lib/scraping/scrapingPolicy';
import { usStateSlug } from '@/lib/geo';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// shahidirfan/bizbuysell-scraper — BizBuySell (largest US small-business
// marketplace) listing scraper. Pay-per-result (~$0.0015/listing, no rental),
// validated against a real run. Input takes `location` + `keyword` free text
// plus `results_wanted` / `max_pages`. Output is snake_case deal fields
// (price, cash_flow, gross_revenue, url, broker_name, …), all USD.
const BIZBUYSELL_ACTOR = 'shahidirfan/bizbuysell-scraper';

/** Coerce the actor's money/number fields (number or numeric string) to a number. */
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.replace(/[$,]/g, '').match(/\d+(\.\d+)?/);
    return m ? Math.round(parseFloat(m[0])) : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Build the actor input from the buyer's criteria. */
export function buildInput(criteria: SearchCriteria): Record<string, unknown> {
  const input: Record<string, unknown> = {
    results_wanted: cappedMaxResults(parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50', 10)),
    max_pages: parseInt(process.env.SCRAPER_MAX_PAGES || '5', 10),
  };
  // The actor filters by full state name ("texas"), not city or "City, ST".
  // City-level relevance is handled downstream by the ranker's location score.
  const location = usStateSlug(criteria.location.state);
  if (location) input.location = location;
  // Skip the generic "Business services" fallback so it doesn't over-narrow.
  const keyword = criteria.industry.primary;
  if (keyword && !/^business services$/i.test(keyword.trim())) input.keyword = keyword;
  return input;
}

/** Map one raw BizBuySell dataset item to a RawLead — deal fields only; the
 *  full item is kept in rawData so nothing is lost. */
export function mapItems(items: Record<string, unknown>[], criteria: SearchCriteria): RawLead[] {
  const currentYear = new Date().getUTCFullYear();
  return items.map((item) => {
    const yearEstablished = num(item.year_established);
    const category = str(item.listing_category) || str(item.industry);
    // `location` arrives as "City, ST" — keep just the city; state_code has the state.
    const locStr = str(item.location);
    const city = locStr ? locStr.split(',')[0].trim() : criteria.location.city;
    return {
      businessName: str(item.title) || 'Unknown',
      address: null,
      city: city || criteria.location.city,
      state: str(item.state_code) || criteria.location.state,
      zip: null,
      phone: str(item.contact_phone),
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: category ? [category] : [],
      yearsInBusiness: yearEstablished ? currentYear - yearEstablished : null,
      employeeCount: num(item.employees_full_time),
      bbbRating: null,
      bbbAccredited: null,
      source: 'bizbuysell' as const,
      sourceUrl: str(item.url),
      // Deal fields — BizBuySell listings are for-sale businesses, all USD.
      askingPrice: num(item.price),
      annualRevenue: num(item.gross_revenue),
      annualProfit: num(item.cash_flow),
      currency: 'USD',
      forSale: true,
      foundedDate: yearEstablished ? String(yearEstablished) : null,
      rawData: item,
    };
  });
}

export async function scrapeBizBuySell(criteria: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('bizbuysell');
  const input = buildInput(criteria);

  let runId = 'unknown';
  try {
    const run = await client.actor(BIZBUYSELL_ACTOR).call(input, { waitSecs: 120 });
    runId = run.id;
    console.log(`[BizBuySell] run id=${run.id} status=${run.status} input=${JSON.stringify(input)}`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const arr = items as Record<string, unknown>[];
    console.log(`[BizBuySell] total items returned: ${arr.length}`);
    return mapItems(arr, criteria);
  } catch (err) {
    console.error(`[BizBuySell] run id=${runId} failed:`, err);
    throw err;
  }
}
