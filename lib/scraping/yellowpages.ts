import { ApifyClient } from 'apify-client';
import { RawLead } from '@/lib/types';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// trudax/yellow-pages-us-scraper — 130k+ runs on Apify, takes a free-text
// `search` keyword + a `location` string. Mirrors the BBB pattern.
const YP_ACTOR = 'trudax/yellow-pages-us-scraper';

function parseInteger(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  return null;
}

function parseFloatish(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }
  return null;
}

export async function scrapeYellowPages(
  queries: string[],
  location: { city: string; state: string; radiusMiles: number },
): Promise<RawLead[]> {
  const maxResults = parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50');
  const perQuery = Math.max(5, Math.ceil(maxResults / queries.length));
  const locationString = `${location.city}, ${location.state}`;

  const results = await Promise.allSettled(
    queries.map((q) =>
      client.actor(YP_ACTOR).call(
        {
          search: q,
          location: locationString,
          maxItems: perQuery,
        },
        { waitSecs: 120 },
      ),
    ),
  );

  const allItems: Record<string, unknown>[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      console.error(`[YellowPages] query "${queries[i]}" failed:`, r.reason);
      continue;
    }
    console.log(`[YellowPages] run id=${r.value.id} status=${r.value.status} query="${queries[i]}"`);
    const { items } = await client.dataset(r.value.defaultDatasetId).listItems();
    allItems.push(...(items as Record<string, unknown>[]));
  }

  console.log(`[YellowPages] total items returned: ${allItems.length}`);

  return allItems.map((item) => ({
    businessName:
      (item.businessName as string) ||
      (item.name as string) ||
      (item.title as string) ||
      'Unknown',
    address: (item.address as string) || (item.streetAddress as string) || null,
    city: (item.city as string) || location.city,
    state: (item.state as string) || location.state,
    zip: (item.zip as string) || (item.postalCode as string) || null,
    phone: (item.phone as string) || (item.phoneNumber as string) || null,
    website: (item.website as string) || (item.url as string) || null,
    googleRating: parseFloatish(item.rating),
    reviewCount: parseInteger(item.reviewCount ?? item.reviews),
    categories:
      Array.isArray(item.categories)
        ? (item.categories as string[])
        : item.category
          ? [item.category as string]
          : [],
    yearsInBusiness: parseInteger(item.yearsInBusiness ?? item.years_in_business),
    employeeCount: null,
    bbbRating: null,
    bbbAccredited: null,
    source: 'yellowpages' as const,
    sourceUrl:
      (item.profileUrl as string) ||
      (item.detailUrl as string) ||
      (item.url as string) ||
      null,
    rawData: item,
  }));
}
