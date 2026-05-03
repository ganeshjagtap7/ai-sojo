/**
 * Smoke-test the YellowPages and Manta scrapers in isolation, without
 * spinning up the full pipeline or touching the LLM. Each run consumes
 * Apify credits — keep maxItems low.
 *
 * Run with (tsx loads .env.local via --env-file):
 *   npx tsx --env-file=.env.local scripts/test-scrapers.ts
 *
 * Override the test target via env vars:
 *   INDUSTRY=plumbing CITY=Atlanta STATE=GA npx tsx --env-file=.env.local scripts/test-scrapers.ts
 *
 * Limit results so you don't burn through credits during dev:
 *   MAX_RESULTS_PER_SCRAPER=10 npx tsx --env-file=.env.local scripts/test-scrapers.ts
 */

import { scrapeYellowPages } from '../lib/scraping/yellowpages';
import { scrapeManta } from '../lib/scraping/manta';
import type { SearchCriteria } from '../lib/types';

const INDUSTRY = process.env.INDUSTRY ?? 'plumbing';
const CITY = process.env.CITY ?? 'Atlanta';
const STATE = process.env.STATE ?? 'GA';

if (!process.env.APIFY_API_TOKEN) {
  console.error('APIFY_API_TOKEN missing from environment. Did you load .env.local?');
  process.exit(1);
}

const criteria: SearchCriteria = {
  location: { city: CITY, state: STATE, country: 'US', radiusMiles: 25 },
  industry: { primary: INDUSTRY, subSectors: [], keywords: [] },
  businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
  preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
  searcherType: 'self_funded',
};

const ypQueries = [INDUSTRY, `${INDUSTRY} contractor`];

function summarize(label: string, leads: Array<{ businessName: string; city: string | null; state: string | null; phone: string | null; website: string | null; source: string }>) {
  console.log(`\n--- ${label} ---`);
  console.log(`  count: ${leads.length}`);
  if (leads.length === 0) {
    console.log('  (no results — check actor subscription or input shape)');
    return;
  }
  console.log('  sample (first 3):');
  for (const l of leads.slice(0, 3)) {
    const loc = [l.city, l.state].filter(Boolean).join(', ') || '—';
    console.log(`    • ${l.businessName} · ${loc} · ${l.phone ?? 'no phone'} · ${l.website ?? 'no website'}`);
  }
  const withPhone = leads.filter((l) => l.phone).length;
  const withSite = leads.filter((l) => l.website).length;
  console.log(`  contactable: ${withPhone}/${leads.length} have phone, ${withSite}/${leads.length} have website`);
}

(async () => {
  console.log(`Test target: "${INDUSTRY}" in ${CITY}, ${STATE}`);
  console.log(`MAX_RESULTS_PER_SCRAPER: ${process.env.MAX_RESULTS_PER_SCRAPER ?? '50 (default)'}`);

  const t0 = Date.now();
  const [yp, manta] = await Promise.allSettled([
    scrapeYellowPages(ypQueries, criteria.location),
    scrapeManta(criteria),
  ]);
  console.log(`\nfinished in ${Math.round((Date.now() - t0) / 1000)}s`);

  if (yp.status === 'fulfilled') {
    summarize('YellowPages (trudax/yellow-pages-us-scraper)', yp.value);
  } else {
    console.error('\n--- YellowPages FAILED ---');
    console.error(yp.reason);
  }

  if (manta.status === 'fulfilled') {
    summarize('Manta (jungle_synthesizer/manta-scraper)', manta.value);
  } else {
    console.error('\n--- Manta FAILED ---');
    console.error(manta.reason);
  }
})();
