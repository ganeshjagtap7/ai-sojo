import { ApifyClient } from 'apify-client';
import { RawLead } from '@/lib/types';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export function capItems<T>(items: (T | null)[], max: number): T[] {
  return items.filter((x): x is T => x != null).slice(0, max);
}

/**
 * Run one of OUR actors (which push RawLead-shaped items to their dataset)
 * and return the leads. Mirrors the pattern in lib/scraping/googleMaps.ts.
 */
export async function runApifyScraper(
  actorSlug: string,
  input: Record<string, unknown>,
  opts: { timeoutSecs?: number; maxItems?: number } = {},
): Promise<RawLead[]> {
  const { timeoutSecs = 180, maxItems = 200 } = opts;
  const run = await client.actor(actorSlug).call(input, { waitSecs: timeoutSecs });
  console.log(`[Apify:${actorSlug}] run=${run.id} status=${run.status}`);
  if (run.status !== 'SUCCEEDED') {
    await client.run(run.id).abort().catch(() => {});
    throw new Error(`[Apify:${actorSlug}] run ${run.status}`);
  }
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: maxItems });
  return capItems(items as unknown as RawLead[], maxItems);
}
