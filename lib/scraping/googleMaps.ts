import { ApifyClient } from 'apify-client';
import { assertRunUsable } from '@/lib/scraping/apifyGuard';
import { RawLead } from '@/lib/types';
import { assertPublicSource, cappedMaxResults } from '@/lib/scraping/scrapingPolicy';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const GOOGLE_MAPS_ACTOR = 'compass/crawler-google-places';

export async function scrapeGoogleMaps(
  queries: string[],
  location: { city: string; state: string; radiusMiles: number }
): Promise<RawLead[]> {
  assertPublicSource('google_maps');
  const maxResults = cappedMaxResults(parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50'));

  const run = await client.actor(GOOGLE_MAPS_ACTOR).call({
    searchStringsArray: queries,
    locationQuery: `${location.city}, ${location.state}`,
    maxCrawledPlacesPerSearch: Math.ceil(maxResults / queries.length),
    language: 'en',
    deeperCityScrape: false,
  }, {
    waitSecs: 120,
  });

  console.log(`[GoogleMaps] run id=${run.id} status=${run.status}`);
  assertRunUsable(run, 'GoogleMaps');
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[GoogleMaps] items returned: ${items.length}`);

  return (items as Record<string, unknown>[]).map((item) => ({
    businessName: (item.title as string) || (item.name as string) || 'Unknown',
    address: (item.address as string) || (item.street as string) || null,
    city: (item.city as string) || location.city,
    state: (item.state as string) || location.state,
    zip: (item.postalCode as string) || null,
    phone: (item.phone as string) || (item.phoneUnformatted as string) || null,
    website: (item.website as string) || (item.url as string) || null,
    googleRating: (item.totalScore as number) || null,
    reviewCount: (item.reviewsCount as number) || null,
    categories: (item.categories as string[]) || [],
    yearsInBusiness: null,
    employeeCount: null,
    bbbRating: null,
    bbbAccredited: null,
    source: 'google_maps' as const,
    sourceUrl: (item.url as string) || null,
    rawData: item,
  }));
}
