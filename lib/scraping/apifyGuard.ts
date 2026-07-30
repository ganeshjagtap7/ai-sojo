// lib/scraping/apifyGuard.ts
const TERMINAL_FAILURES = new Set(['FAILED', 'ABORTED', 'TIMED-OUT']);

/**
 * Throw when an Apify run terminally failed. Reading the dataset of a FAILED/
 * ABORTED/TIMED-OUT run silently returns partial-or-zero items — which looks
 * exactly like "the source had no results". Throwing lets the pipeline's
 * allSettled treat it as a failed source (fail-soft, logged). A run still
 * RUNNING after waitSecs is deliberately allowed: its partial dataset is real
 * data and the run finishes server-side.
 */
export function assertRunUsable(run: { id: string; status: string }, label: string): void {
  if (TERMINAL_FAILURES.has(run.status)) {
    throw new Error(`[${label}] Apify run ${run.id} ended ${run.status} — treating source as failed`);
  }
}
