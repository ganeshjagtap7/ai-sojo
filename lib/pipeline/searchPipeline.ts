import { SearchCriteria, RawLead, RankedLead, SearchMetadata } from '@/lib/types';
import { generateSearchQueries } from '@/lib/ai/queryGenerator';
import { selectSources } from '@/lib/scraping/router';
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
  | { phase: 'source'; source: string; ok: boolean; index: number; total: number }
  | { phase: 'dedup'; count: number }
  | { phase: 'enriching'; count: number }
  | { phase: 'ranking' };

type OnProgress = (event: ProgressEvent) => void;

/**
 * Run the full pipeline (queries → routed scrape → dedup → enrich → rank) and
 * return the result. Synchronous from the caller's perspective; takes 30–90s
 * end-to-end, well under Vercel's 300s function ceiling.
 *
 * Sources are no longer hardcoded: lib/scraping/router.ts picks the relevant
 * sources for these criteria from the registry (always-on core + up to
 * MAX_EXTRA_SOURCES routed extras).
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

  // Whole-pipeline budget (scrape + enrich + rank), kept under the route's
  // maxDuration=300s so we always finish streaming a result instead of being
  // hard-killed by Vercel mid-response. Enrichment stops early enough to leave
  // the ranker room.
  const pipelineBudgetMs = parseInt(process.env.PIPELINE_BUDGET_MS || '270000', 10);
  const rankReserveMs = parseInt(process.env.RANK_RESERVE_MS || '45000', 10);
  const pipelineDeadline = startTime + pipelineBudgetMs;

  const queries = await generateSearchQueries(criteria);
  onProgress({ phase: 'queries' });

  const picked = selectSources(criteria);
  console.log(`[Pipeline] Routed sources: ${picked.map((s) => s.id).join(', ')}`);

  // Each scraper gets a 1-based index so the UI can render "{index} of {total}".
  // We attach a .then/.catch per scraper to emit a settle event the moment it
  // resolves or rejects, while still feeding the same promises into
  // Promise.allSettled so a single failure never aborts the batch.
  const total = picked.length;
  const runs = picked.map((def, i) => ({
    def,
    index: i + 1,
    promise: def.run({ criteria, queries }),
  }));

  for (const { def, index, promise } of runs) {
    promise
      .then(() => onProgress({ phase: 'source', source: def.id, ok: true, index, total }))
      .catch(() => onProgress({ phase: 'source', source: def.id, ok: false, index, total }));
  }

  // Scrape-phase time budget. The pipeline used to wait for EVERY scraper to
  // finish before enriching/ranking, so one slow browser actor could drag the
  // whole request past Vercel's 300s function ceiling → a hard timeout with
  // ZERO results. Instead we race each scraper against a shared deadline: when
  // it fires, any scraper still running is abandoned (its Apify run keeps going
  // server-side, we just stop waiting) and we proceed with whatever returned.
  // A search now always returns its best-available set instead of timing out.
  const scrapeBudgetMs = parseInt(process.env.SCRAPE_BUDGET_MS || '180000', 10);
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<PromiseSettledResult<RawLead[]>>((resolve) => {
    budgetTimer = setTimeout(
      () => resolve({ status: 'rejected', reason: new Error('scrape budget exceeded') }),
      scrapeBudgetMs,
    );
  });
  const settled: PromiseSettledResult<RawLead[]>[] = await Promise.all(
    runs.map((r) =>
      Promise.race([
        r.promise.then(
          (value): PromiseSettledResult<RawLead[]> => ({ status: 'fulfilled', value }),
          (reason): PromiseSettledResult<RawLead[]> => ({ status: 'rejected', reason }),
        ),
        deadline,
      ]),
    ),
  );
  clearTimeout(budgetTimer);

  settled.forEach((res, i) => {
    if (res.status === 'rejected') {
      console.error(`[Pipeline] ${runs[i].def.label} scraper failed:`, res.reason);
    } else {
      console.log(`[Pipeline] ${runs[i].def.id}: ${res.value.length} leads`);
    }
  });

  const rawLeads: RawLead[] = settled.flatMap((res) =>
    res.status === 'fulfilled' ? res.value : []);

  console.log(`[Pipeline] Raw leads collected: ${rawLeads.length}`);

  if (rawLeads.length === 0) {
    const reasons = settled
      .map((res, i) => res.status === 'rejected'
        ? `${runs[i].def.label}: ${(res.reason as Error)?.message || res.reason}` : null)
      .filter(Boolean).join('; ');
    if (reasons) console.error('[Pipeline] No raw leads; source reasons:', reasons);
    throw new Error(NO_RESULTS);
  }

  const dedupedLeads = deduplicateLeads(rawLeads);
  onProgress({ phase: 'dedup', count: dedupedLeads.length });

  onProgress({ phase: 'enriching', count: dedupedLeads.length });
  const enrichedLeads = await enrichLeads(dedupedLeads, criteria, pipelineDeadline - rankReserveMs);

  onProgress({ phase: 'ranking' });
  const rankedLeads = await rankLeads(enrichedLeads, criteria, pipelineDeadline);

  const threshold = parseInt(process.env.MATCH_SCORE_THRESHOLD || '40');
  // No hard result cap — return EVERY lead that clears the quality threshold
  // (Ganesh: surface all available results, not a fixed 30). An optional
  // RESULTS_LIMIT env can re-impose a cap if ever needed; unlimited by default.
  const resultsLimit = parseInt(process.env.RESULTS_LIMIT || '0', 10);
  const qualified = rankedLeads.filter((lead) => lead.matchScore >= threshold);
  const finalLeads = resultsLimit > 0 ? qualified.slice(0, resultsLimit) : qualified;

  const sourcesUsed: string[] = settled
    .map((res, i) => (res.status === 'fulfilled' && res.value.length > 0 ? runs[i].def.id : null))
    .filter((x): x is RawLead['source'] => x !== null);

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
