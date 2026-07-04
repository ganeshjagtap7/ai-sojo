import { SearchCriteria, RawLead, RankedLead, SearchMetadata } from '@/lib/types';
import { generateSearchQueries } from '@/lib/ai/queryGenerator';
import { scrapeGoogleMaps } from '@/lib/scraping/googleMaps';
import { scrapeWebSearch } from '@/lib/scraping/webSearch';
import { scrapeBBB } from '@/lib/scraping/bbb';
import { scrapeYellowPages } from '@/lib/scraping/yellowpages';
import { scrapeManta } from '@/lib/scraping/manta';
import { deduplicateLeads } from '@/lib/utils/deduplicator';
import { enrichLeads } from '@/lib/ai/enricher';
import { rankLeads } from '@/lib/ai/ranker';
import { NO_RESULTS } from '@/lib/errors/friendly';

export interface SearchResult {
  leads: RankedLead[];
  metadata: SearchMetadata;
}

/**
 * Progress events emitted by the pipeline as it advances through its phases.
 * Streamed to the client as SSE so the UI can show a live running label.
 */
export type ProgressEvent =
  | { phase: 'queries' }
  | { phase: 'source'; source: string; ok: boolean; index: number; total: 5 }
  | { phase: 'dedup'; count: number }
  | { phase: 'enriching'; count: number }
  | { phase: 'ranking' };

type OnProgress = (event: ProgressEvent) => void;

/**
 * Run the full pipeline (queries → scrape × 5 → dedup → enrich → rank) and
 * return the result. Synchronous from the caller's perspective; takes 30–90s
 * end-to-end, well under Vercel's 300s function ceiling.
 *
 * Note: previously this kicked the pipeline async and tracked it via an
 * in-memory jobStore polled by the client. That broke on Vercel because
 * each serverless instance has its own Map, so /status polls usually hit
 * an instance that never saw the create call. Returning synchronously
 * sidesteps the shared-state requirement entirely.
 */
export async function runSearchPipeline(
  criteria: SearchCriteria,
  onProgress: OnProgress = () => {},
): Promise<SearchResult> {
  const startTime = Date.now();

  const queries = await generateSearchQueries(criteria);
  onProgress({ phase: 'queries' });

  // Each scraper gets a 1-based index so the UI can render "{index} of 5".
  // We attach a .then/.catch per scraper to emit a settle event the moment it
  // resolves or rejects, while still feeding the same promises into
  // Promise.allSettled so a single failure never aborts the batch.
  const sources: Array<{ source: string; index: number; promise: Promise<RawLead[]> }> = [
    { source: 'google_maps', index: 1, promise: scrapeGoogleMaps(queries.googleMaps, criteria.location) },
    { source: 'web_search', index: 2, promise: scrapeWebSearch(queries.webSearch) },
    { source: 'bbb', index: 3, promise: scrapeBBB(queries.bbb, criteria.location) },
    { source: 'yellowpages', index: 4, promise: scrapeYellowPages(queries.yellowpages, criteria.location) },
    { source: 'manta', index: 5, promise: scrapeManta(criteria) },
  ];

  for (const { source, index, promise } of sources) {
    promise
      .then(() => onProgress({ phase: 'source', source, ok: true, index, total: 5 }))
      .catch(() => onProgress({ phase: 'source', source, ok: false, index, total: 5 }));
  }

  const [mapsResult, webResult, bbbResult, ypResult, mantaResult] = await Promise.allSettled(
    sources.map((s) => s.promise),
  );

  if (mapsResult.status === 'rejected') console.error('[Pipeline] Google Maps scraper failed:', mapsResult.reason);
  if (webResult.status === 'rejected') console.error('[Pipeline] Web search scraper failed:', webResult.reason);
  if (bbbResult.status === 'rejected') console.error('[Pipeline] BBB scraper failed:', bbbResult.reason);
  if (ypResult.status === 'rejected') console.error('[Pipeline] YellowPages scraper failed:', ypResult.reason);
  if (mantaResult.status === 'rejected') console.error('[Pipeline] Manta scraper failed:', mantaResult.reason);

  const rawLeads: RawLead[] = [
    ...(mapsResult.status === 'fulfilled' ? mapsResult.value : []),
    ...(webResult.status === 'fulfilled' ? webResult.value : []),
    ...(bbbResult.status === 'fulfilled' ? bbbResult.value : []),
    ...(ypResult.status === 'fulfilled' ? ypResult.value : []),
    ...(mantaResult.status === 'fulfilled' ? mantaResult.value : []),
  ];

  console.log(`[Pipeline] Raw leads collected: ${rawLeads.length}`);

  if (rawLeads.length === 0) {
    const reasons = [
      mapsResult.status === 'rejected' ? `Maps: ${mapsResult.reason?.message || mapsResult.reason}` : null,
      webResult.status === 'rejected' ? `Web: ${webResult.reason?.message || webResult.reason}` : null,
      bbbResult.status === 'rejected' ? `BBB: ${bbbResult.reason?.message || bbbResult.reason}` : null,
      ypResult.status === 'rejected' ? `YellowPages: ${ypResult.reason?.message || ypResult.reason}` : null,
      mantaResult.status === 'rejected' ? `Manta: ${mantaResult.reason?.message || mantaResult.reason}` : null,
    ].filter(Boolean).join('; ');
    if (reasons) console.error('[Pipeline] No raw leads; source reasons:', reasons);
    throw new Error(NO_RESULTS);
  }

  const dedupedLeads = deduplicateLeads(rawLeads);
  onProgress({ phase: 'dedup', count: dedupedLeads.length });

  onProgress({ phase: 'enriching', count: dedupedLeads.length });
  const enrichedLeads = await enrichLeads(dedupedLeads, criteria);

  onProgress({ phase: 'ranking' });
  const rankedLeads = await rankLeads(enrichedLeads, criteria);

  const threshold = parseInt(process.env.MATCH_SCORE_THRESHOLD || '40');
  const finalLeads = rankedLeads
    .filter((lead) => lead.matchScore >= threshold)
    .slice(0, 30);

  const sourcesUsed: string[] = [
    ...(mapsResult.status === 'fulfilled' ? ['google_maps'] : []),
    ...(webResult.status === 'fulfilled' ? ['web_search'] : []),
    ...(bbbResult.status === 'fulfilled' ? ['bbb'] : []),
    ...(ypResult.status === 'fulfilled' ? ['yellowpages'] : []),
    ...(mantaResult.status === 'fulfilled' ? ['manta'] : []),
  ];

  return {
    leads: finalLeads,
    metadata: {
      totalScraped: rawLeads.length,
      afterDedup: dedupedLeads.length,
      afterFiltering: finalLeads.length,
      sourcesUsed,
      searchDurationSeconds: Math.round((Date.now() - startTime) / 1000),
    },
  };
}
