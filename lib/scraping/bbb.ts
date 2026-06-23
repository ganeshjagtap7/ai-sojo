import { ApifyClient } from 'apify-client';
import { RawLead } from '@/lib/types';
import { assertPublicSource, cappedMaxResults } from '@/lib/scraping/scrapingPolicy';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const BBB_ACTOR = 'piotrv1001/bbb-advanced-scraper';

function parseAccredited(item: Record<string, unknown>): boolean | null {
  const v = item.accreditationStatus ?? item.accredited ?? item.isAccredited;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(true|yes|accredited)$/i.test(v);
  return null;
}

function parseRating(item: Record<string, unknown>): string | null {
  const v = item.rating ?? item.bbbRating ?? item.letterRating;
  return typeof v === 'string' && v.length <= 3 ? v : null;
}

function parseYearsInBusiness(item: Record<string, unknown>): number | null {
  const v = item.yearsInBusiness;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    return m ? parseInt(m[0]) : null;
  }
  return null;
}

export async function scrapeBBB(
  queries: string[],
  location: { city: string; state: string; radiusMiles: number }
): Promise<RawLead[]> {
  assertPublicSource('bbb');
  const maxResults = cappedMaxResults(parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50'));
  const perQuery = Math.max(5, Math.ceil(maxResults / queries.length));
  const locationString = `${location.city}, ${location.state}`;

  const results = await Promise.allSettled(
    queries.map((q) =>
      client.actor(BBB_ACTOR).call(
        {
          searchKeyword: q,
          location: locationString,
          distance: location.radiusMiles,
          maxItems: perQuery,
        },
        { waitSecs: 120 }
      )
    )
  );

  const allItems: Record<string, unknown>[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      console.error(`[BBB] query "${queries[i]}" failed:`, r.reason);
      continue;
    }
    console.log(`[BBB] run id=${r.value.id} status=${r.value.status} query="${queries[i]}"`);
    const { items } = await client.dataset(r.value.defaultDatasetId).listItems();
    allItems.push(...(items as Record<string, unknown>[]));
  }

  console.log(`[BBB] total items returned: ${allItems.length}`);

  return allItems.map((item) => ({
    businessName:
      (item.businessName as string) ||
      (item.name as string) ||
      (item.title as string) ||
      'Unknown',
    address: (item.address as string) || (item.streetAddress as string) || null,
    city: (item.city as string) || location.city,
    state: (item.state as string) || location.state,
    zip: (item.postalCode as string) || (item.zip as string) || null,
    phone: (item.phone as string) || (item.phoneNumber as string) || null,
    website: (item.website as string) || (item.url as string) || null,
    googleRating: null,
    reviewCount: null,
    categories:
      (item.categories as string[]) ||
      (item.primaryCategory ? [item.primaryCategory as string] : []),
    yearsInBusiness: parseYearsInBusiness(item),
    employeeCount: null,
    bbbRating: parseRating(item),
    bbbAccredited: parseAccredited(item),
    source: 'bbb' as const,
    sourceUrl: (item.reportUrl as string) || (item.profileUrl as string) || null,
    rawData: item,
  }));
}
