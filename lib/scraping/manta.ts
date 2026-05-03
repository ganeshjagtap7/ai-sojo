import { ApifyClient } from 'apify-client';
import { RawLead, SearchCriteria } from '@/lib/types';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// jungle_synthesizer/manta-scraper — small business directory scraper.
// Unusual input shape: takes `states` (array of 2-letter codes) and `category`
// (a fixed slug, not free text), so we can't pass arbitrary keyword queries
// through it. Instead we map our SearchCriteria to its closest category slug.
//
// Known limitation: as of Apr 2026 this actor's `states` filter is unreliable
// — many runs return IL results regardless of input. We still pass the user's
// state, but downstream dedup/ranking handles cross-state spillover.
const MANTA_ACTOR = 'jungle_synthesizer/manta-scraper';

// Manta's allowed category slugs. Industries that don't map cleanly fall back
// to 'consumer_products_and_services' (broad catch-all).
type MantaCategory =
  | 'professional_services'
  | 'restaurants_and_bars'
  | 'health_and_medicine'
  | 'automotive'
  | 'construction'
  | 'real_estate'
  | 'financial_services'
  | 'education'
  | 'technology'
  | 'consumer_products_and_services';

function categoryFor(industry: string): MantaCategory {
  const s = industry.toLowerCase();
  if (/plumb|hvac|electric|roof|construct|contractor|landscap|build/.test(s)) return 'construction';
  if (/dental|dentist|clinic|medical|health|chiropractic|optometr/.test(s)) return 'health_and_medicine';
  if (/restaurant|cafe|coffee|bar|food|brewery|catering/.test(s)) return 'restaurants_and_bars';
  if (/auto|mechanic|tire|body shop|car wash|collision/.test(s)) return 'automotive';
  if (/real estate|property|realtor|broker/.test(s)) return 'real_estate';
  if (/account|cpa|tax|insurance|financial|bookkeep|wealth/.test(s)) return 'financial_services';
  if (/school|tutor|education|academ/.test(s)) return 'education';
  if (/software|tech|saas|it services|cyber|data/.test(s)) return 'technology';
  if (/consult|legal|law|attorney|professional/.test(s)) return 'professional_services';
  return 'consumer_products_and_services';
}

function parseInteger(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  return null;
}

export async function scrapeManta(criteria: SearchCriteria): Promise<RawLead[]> {
  const maxResults = parseInt(process.env.MAX_RESULTS_PER_SCRAPER || '50');
  const category = categoryFor(criteria.industry.primary);
  const states = criteria.location.state ? [criteria.location.state] : ['IL'];

  let runId = 'unknown';
  try {
    const run = await client.actor(MANTA_ACTOR).call(
      { states, category, maxItems: maxResults },
      { waitSecs: 120 },
    );
    runId = run.id;
    console.log(`[Manta] run id=${run.id} status=${run.status} category="${category}" states=${states.join(',')}`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const arr = items as Record<string, unknown>[];
    console.log(`[Manta] total items returned: ${arr.length}`);

    // Manta's actor emits snake_case fields. Year founded → years in business
    // is derived (current year minus year_founded) since the upstream already
    // resolves it from the listing.
    const currentYear = new Date().getUTCFullYear();
    return arr.map((item) => {
      const yearFounded = parseInteger(item.year_founded);
      const yearsInBusiness = yearFounded ? currentYear - yearFounded : null;
      const subcat = (item.subcategory as string) || (item.category as string) || category;
      return {
        businessName: (item.business_name as string) || (item.businessName as string) || 'Unknown',
        address: (item.address as string) || null,
        city: (item.city as string) || criteria.location.city,
        state: (item.state as string) || criteria.location.state,
        zip: (item.zip as string) || null,
        phone: (item.phone as string) || null,
        website: (item.website as string) || null,
        googleRating: null,
        reviewCount: null,
        categories: subcat ? [subcat] : [],
        yearsInBusiness,
        employeeCount: parseInteger(item.employee_count),
        bbbRating: null,
        bbbAccredited: null,
        source: 'manta' as const,
        sourceUrl: (item.listing_url as string) || (item.profileUrl as string) || null,
        rawData: item,
      };
    });
  } catch (err) {
    console.error(`[Manta] run id=${runId} failed:`, err);
    throw err;
  }
}
