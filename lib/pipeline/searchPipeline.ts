import { SearchCriteria, RawLead } from '@/lib/types';
import { jobStore } from './jobStore';
import { generateSearchQueries } from '@/lib/ai/queryGenerator';
import { scrapeGoogleMaps } from '@/lib/scraping/googleMaps';
import { scrapeWebSearch } from '@/lib/scraping/webSearch';
import { deduplicateLeads } from '@/lib/utils/deduplicator';
import { enrichLeads } from '@/lib/ai/enricher';
import { rankLeads } from '@/lib/ai/ranker';

export async function runSearchPipeline(jobId: string, criteria: SearchCriteria) {
  const startTime = Date.now();

  try {
    // Step 1: Generate search queries
    jobStore.updateProgress(jobId, 'generating_queries', 0, 4, 'Generating search queries from your criteria...');
    const queries = await generateSearchQueries(criteria);

    // Step 2 + 3: Scrape in parallel
    jobStore.updateProgress(
      jobId,
      'scraping_google_maps',
      1,
      4,
      `Searching Google Maps for ${criteria.industry.primary} in ${criteria.location.city}...`
    );

    const [mapsResult, webResult] = await Promise.allSettled([
      scrapeGoogleMaps(queries.googleMaps, criteria.location),
      scrapeWebSearch(queries.webSearch),
    ]);

    if (mapsResult.status === 'rejected') {
      console.error('[Pipeline] Google Maps scraper failed:', mapsResult.reason);
    }
    if (webResult.status === 'rejected') {
      console.error('[Pipeline] Web search scraper failed:', webResult.reason);
    }

    const rawLeads: RawLead[] = [
      ...(mapsResult.status === 'fulfilled' ? mapsResult.value : []),
      ...(webResult.status === 'fulfilled' ? webResult.value : []),
    ];

    console.log(`[Pipeline] Raw leads collected: ${rawLeads.length}`);

    if (rawLeads.length === 0) {
      const reasons = [
        mapsResult.status === 'rejected' ? `Maps: ${mapsResult.reason?.message || mapsResult.reason}` : null,
        webResult.status === 'rejected' ? `Web: ${webResult.reason?.message || webResult.reason}` : null,
      ].filter(Boolean).join('; ');
      throw new Error(reasons || 'No results found from any source. Try broadening your criteria.');
    }

    const dedupedLeads = deduplicateLeads(rawLeads);

    // Step 4: Enrich + rank
    jobStore.updateProgress(
      jobId,
      'enriching_and_ranking',
      3,
      4,
      `Analyzing and ranking ${dedupedLeads.length} businesses found...`
    );

    const enrichedLeads = await enrichLeads(dedupedLeads, criteria);
    const rankedLeads = await rankLeads(enrichedLeads, criteria);

    const threshold = parseInt(process.env.MATCH_SCORE_THRESHOLD || '40');
    const finalLeads = rankedLeads
      .filter((lead) => lead.matchScore >= threshold)
      .slice(0, 30);

    const sourcesUsed: string[] = [
      ...(mapsResult.status === 'fulfilled' ? ['google_maps'] : []),
      ...(webResult.status === 'fulfilled' ? ['web_search'] : []),
    ];

    jobStore.complete(jobId, finalLeads, {
      totalScraped: rawLeads.length,
      afterDedup: dedupedLeads.length,
      afterFiltering: finalLeads.length,
      sourcesUsed,
      searchDurationSeconds: Math.round((Date.now() - startTime) / 1000),
    });
  } catch (err) {
    jobStore.fail(jobId, err instanceof Error ? err.message : 'Unknown error');
  }
}
