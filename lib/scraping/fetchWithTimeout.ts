// lib/scraping/fetchWithTimeout.ts
/**
 * fetch() with a hard per-request timeout. The raw-fetch scrapers had none, so
 * a single hung upstream held its scraper slot until the pipeline-wide scrape
 * budget fired. 15s is generous for a public list page.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = parseInt(process.env.SCRAPER_FETCH_TIMEOUT_MS || '15000', 10),
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
