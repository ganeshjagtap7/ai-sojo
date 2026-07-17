import { ApifyClient } from 'apify-client';
import { RawLead, SearchCriteria } from '@/lib/types';
import { assertPublicSource, cappedMaxResults } from '@/lib/scraping/scrapingPolicy';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// crawlerbros/acquire-scraper — Acquire.com (global SaaS/startup marketplace,
// ex-MicroAcquire). Pay-per-event, no rental. Captures the public deal data:
// asking price, ANNUAL revenue & profit, revenue/profit multiples, and currency.
// (No location field — online startups; use igolaizola if location is needed.)
const ACQUIRE_ACTOR = 'crawlerbros/acquire-scraper';

/** Number, treating 0/negative/missing as absent (avoids misleading $0 / 0×). */
function pos(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const m = v.replace(/[$,]/g, '').match(/\d+(\.\d+)?/);
    const n = m ? parseFloat(m[0]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Acquire's category filter values (verified server-side). Map the thesis to
// one when it clearly matches; otherwise omit (return all, ranker judges fit) —
// never pass a guessed value, which would filter to zero.
function acquireCategory(industry: string): string | null {
  const s = industry.toLowerCase();
  if (/\bsaas\b|software|b2b|\bapi\b|platform/.test(s)) return 'SaaS';
  if (/ecommerce|e-commerce|shopify|\bdtc\b|online store|amazon|\bfba\b/.test(s)) return 'Ecommerce';
  if (/mobile|\bapp\b|ios|android|game/.test(s)) return 'Mobile';
  if (/marketplace/.test(s)) return 'Marketplace';
  if (/agency|consult/.test(s)) return 'Agency';
  return null;
}

/** Build actor input. Passes the price band (maps to our businessSize, incl.
 *  deal-aware priceMax), caps results, and filters by Acquire category when the
 *  thesis clearly maps to one (else broad — the ranker judges fit). */
export function buildInput(criteria: SearchCriteria): Record<string, unknown> {
  const input: Record<string, unknown> = {
    maxItems: cappedMaxResults(parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50', 10)),
  };
  const { priceMin, priceMax } = criteria.businessSize;
  if (priceMin) input.minPrice = priceMin;
  if (priceMax) input.maxPrice = priceMax;
  const category = acquireCategory(criteria.industry.primary);
  if (category) input.categories = [category];
  return input;
}

/** Map raw crawlerbros items to RawLead. Revenue/profit are already ANNUAL, so
 *  no derivation; missing values come through null (never fabricated). */
export function mapItems(items: Record<string, unknown>[]): RawLead[] {
  return items.map((item) => {
    const category = str(item.category);
    return {
      businessName: str(item.listingHeadline) || 'Unknown',
      address: null,
      city: null, // online startup — Acquire exposes no location via this actor
      state: null,
      zip: null,
      phone: null,
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: category ? [category] : [],
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'acquire' as const,
      sourceUrl: str(item.url) || str(item.canonicalUrl),
      askingPrice: pos(item.askingPrice),
      annualRevenue: pos(item.revenueAnnual), // already annual
      mrr: null, // Acquire (via crawlerbros) reports annual, not monthly
      annualProfit: pos(item.profitAnnual),
      revenueMultiple: pos(item.revenueMultiple),
      profitMultiple: pos(item.profitMultiple),
      currency: str(item.priceCurrency)?.toUpperCase() || 'USD',
      forSale: true,
      foundedDate: null,
      rawData: item,
    };
  });
}

export async function scrapeAcquire(criteria: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('acquire');
  const input = buildInput(criteria);

  let runId = 'unknown';
  try {
    const run = await client.actor(ACQUIRE_ACTOR).call(input, { waitSecs: 180 });
    runId = run.id;
    console.log(`[Acquire] run id=${run.id} status=${run.status} input=${JSON.stringify(input)}`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const arr = items as Record<string, unknown>[];
    console.log(`[Acquire] total items returned: ${arr.length}`);
    return mapItems(arr);
  } catch (err) {
    console.error(`[Acquire] run id=${runId} failed:`, err);
    throw err;
  }
}
