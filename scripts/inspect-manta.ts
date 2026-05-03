/**
 * One-off: print the raw shape of a Manta scraper item so we know which
 * field names to map. Run:
 *   npx tsx --env-file=.env.local scripts/inspect-manta.ts
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

(async () => {
  const run = await client.actor('jungle_synthesizer/manta-scraper').call(
    { states: ['GA'], category: 'construction', maxItems: 3 },
    { waitSecs: 120 },
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const arr = items as Record<string, unknown>[];
  console.log(`Got ${arr.length} items. First item keys + sample values:\n`);
  if (arr[0]) {
    for (const [k, v] of Object.entries(arr[0])) {
      const preview = typeof v === 'string' ? `"${v.slice(0, 80)}"` : JSON.stringify(v).slice(0, 80);
      console.log(`  ${k}: ${preview}`);
    }
    console.log('\nFull JSON of first item:');
    console.log(JSON.stringify(arr[0], null, 2));
  }
})();
