import { ApifyClient } from 'apify-client';
import { RawLead } from '@/lib/types';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const GOOGLE_SEARCH_ACTOR = 'apify/google-search-scraper';

function extractBusinessName(title: string): string {
  return title
    .replace(/\s*[-|–—]\s*(Yelp|Yellow Pages|BBB|Angi|HomeAdvisor|Thumbtack|Google).*$/i, '')
    .trim();
}

function extractPhone(text: string): string | null {
  const match = text?.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return match ? match[0] : null;
}

export async function scrapeWebSearch(queries: string[]): Promise<RawLead[]> {
  const run = await client.actor(GOOGLE_SEARCH_ACTOR).call({
    queries: queries.join('\n'),
    maxPagesPerQuery: 1,
    resultsPerPage: 10,
    languageCode: 'en',
    countryCode: 'us',
  }, {
    waitSecs: 60,
  });

  console.log(`[WebSearch] run id=${run.id} status=${run.status}`);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[WebSearch] items returned: ${items.length}`);

  return (items as Record<string, unknown>[])
    .filter((item) => item.url && !(item.url as string).includes('google.com'))
    .map((item) => ({
      businessName: extractBusinessName((item.title as string) || ''),
      address: null,
      city: null,
      state: null,
      zip: null,
      phone: extractPhone((item.description as string) || ''),
      website: (item.url as string) || null,
      googleRating: null,
      reviewCount: null,
      categories: [],
      yearsInBusiness: null,
      employeeCount: null,
      source: 'web_search' as const,
      sourceUrl: (item.url as string) || null,
      rawData: item,
    }));
}
