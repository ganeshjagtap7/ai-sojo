import { ApifyClient } from 'apify-client';
import { RawLead, SearchCriteria } from '@/lib/types';
import { assertPublicSource, cappedMaxResults } from '@/lib/scraping/scrapingPolicy';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// memo23/empireflippers-scraper — Empire Flippers (global curated online-business
// marketplace: content, SaaS, ecommerce, Amazon FBA). Pay-per-event, no rental.
// Reports MONTHLY revenue/profit and a MONTHLY (SDE) multiple. Per product
// decision we show MRR as listed (monthly), no derived annual, and omit the
// multiple (its monthly basis isn't comparable to other sources' annual ones —
// the raw value stays in rawData). Prices are USD.
const EMPIREFLIPPERS_ACTOR = 'memo23/empireflippers-scraper';

function pos(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const m = v.replace(/[$,]/g, '').match(/\d+(\.\d+)?/);
    const n = m ? parseFloat(m[0]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Build actor input: keyword + active listing statuses + result cap. Empire
 *  Flippers has no price-filter input, so the price band is judged downstream. */
export function buildInput(criteria: SearchCriteria): Record<string, unknown> {
  const input: Record<string, unknown> = {
    maxItems: cappedMaxResults(parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50', 10)),
    listingStatuses: ['For Sale', 'New Listing'], // exclude "Pending Sold"
  };
  const q = criteria.industry.primary;
  if (q && !/^business services$/i.test(q.trim())) input.q = q;
  return input;
}

/** Map raw Empire Flippers items to RawLead. Shows monthly gross revenue as MRR
 *  (as listed), asking price, and niche; no derived annual, no multiple. The
 *  full item (monthly net profit, margin, country, summary…) stays in rawData. */
export function mapItems(items: Record<string, unknown>[]): RawLead[] {
  return items.map((item) => {
    const niches = strArr(item.niches);
    const cats = niches.length ? niches : strArr(item.monetizations);
    return {
      businessName: (typeof item.title === 'string' && item.title.trim()) || 'Unknown',
      address: null,
      city: null, // online business — EF gives country (in rawData), no US state
      state: null,
      zip: null,
      phone: null,
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: cats,
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'empireflippers' as const,
      sourceUrl: typeof item.listingUrl === 'string' ? item.listingUrl : null,
      askingPrice: item.unpriced ? null : pos(item.askingPrice),
      mrr: pos(item.monthlyGrossRevenue), // monthly, as listed
      annualRevenue: null,
      annualProfit: null,
      revenueMultiple: null,
      profitMultiple: null, // EF's multiple is monthly-based — kept in rawData, not shown
      currency: 'USD',
      forSale: true,
      foundedDate: null,
      rawData: item,
    };
  });
}

export async function scrapeEmpireFlippers(criteria: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('empireflippers');
  const input = buildInput(criteria);

  let runId = 'unknown';
  try {
    const run = await client.actor(EMPIREFLIPPERS_ACTOR).call(input, { waitSecs: 180 });
    runId = run.id;
    console.log(`[EmpireFlippers] run id=${run.id} status=${run.status} input=${JSON.stringify(input)}`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const arr = items as Record<string, unknown>[];
    console.log(`[EmpireFlippers] total items returned: ${arr.length}`);
    return mapItems(arr);
  } catch (err) {
    console.error(`[EmpireFlippers] run id=${runId} failed:`, err);
    throw err;
  }
}
