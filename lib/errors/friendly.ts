/**
 * Maps arbitrary thrown values into a calm, user-safe message plus a full
 * technical detail string for server logs.
 *
 * Consumers (Tasks A3/A5) call `toFriendlyError(err)` at the edge — they show
 * `userMessage` to the end user and `console.error` / log `logDetail`. This
 * function never throws and accepts `unknown`, so it is safe to call directly
 * inside a catch block on any value (Error, string, object, null/undefined).
 */

/** Sentinel string that upstream code may throw/return to signal "0 leads". */
export const NO_RESULTS = 'NO_RESULTS';

export interface FriendlyError {
  /** Clean, calm sentence safe to show an end user. No jargon or identifiers. */
  userMessage: string;
  /** Full technical detail (message + name/code/status) for server logs. */
  logDetail: string;
}

const MESSAGES = {
  noResults: 'No matches yet — try broadening your location or industry.',
  quota: "You're going a bit fast — please wait a moment and try again.",
  scraper: 'We hit a snag pulling business listings. Please try again in a moment.',
  ai: 'Our AI is briefly unavailable. Please try again shortly.',
  fallback: 'Something went wrong on our end. Please try again.',
} as const;

/** Pull message / name / code / status off whatever was thrown, into a haystack. */
function extract(err: unknown): { haystack: string; logDetail: string } {
  if (err === null || err === undefined) {
    return { haystack: '', logDetail: String(err) };
  }

  if (typeof err === 'string') {
    return { haystack: err, logDetail: err };
  }

  if (err instanceof Error) {
    const parts = [err.name, err.message];
    // Some SDK errors tack a `.code` / `.status` onto the Error instance.
    const code = (err as { code?: unknown }).code;
    const status = (err as { status?: unknown }).status;
    if (code !== undefined) parts.push(`code=${String(code)}`);
    if (status !== undefined) parts.push(`status=${String(status)}`);
    return {
      haystack: [err.name, err.message, code, status].filter((p) => p !== undefined).join(' '),
      logDetail: parts.filter(Boolean).join(': '),
    };
  }

  if (typeof err === 'object') {
    const obj = err as { message?: unknown; name?: unknown; code?: unknown; status?: unknown };
    const fields = [obj.name, obj.message, obj.code, obj.status].filter((p) => p !== undefined);
    const haystack = fields.map((p) => String(p)).join(' ');
    let logDetail = fields.map((p) => String(p)).join(': ');
    if (!logDetail) {
      try {
        logDetail = JSON.stringify(err);
      } catch {
        logDetail = '[unserializable error object]';
      }
    }
    return { haystack, logDetail };
  }

  // numbers, booleans, symbols, bigints, functions
  return { haystack: String(err), logDetail: String(err) };
}

/**
 * Ordered matchers. NO_RESULTS and quota are checked before the broader
 * scraper/AI buckets, because their phrasing can overlap (e.g. an overloaded
 * model error vs. a rate-limit, or a "no dataset items" message vs. a scraper
 * crash). First match wins.
 */
function classify(haystack: string): string {
  const h = haystack.toLowerCase();

  // 1. Explicit "nothing found" sentinel and natural-language equivalents.
  if (
    h.includes(NO_RESULTS.toLowerCase()) ||
    h.includes('no results found') ||
    h.includes('no matches') ||
    h.includes('try broadening')
  ) {
    return MESSAGES.noResults;
  }

  // 2. Quota / rate limiting (checked before scraper/AI — those services
  //    are where 429s usually originate).
  if (
    h.includes('429') ||
    h.includes('rate limit') ||
    h.includes('rate-limit') ||
    h.includes('ratelimit') ||
    h.includes('quota') ||
    h.includes('too many requests')
  ) {
    return MESSAGES.quota;
  }

  // 3. Apify / scraper failures.
  if (
    h.includes('apify') ||
    h.includes('actor') ||
    h.includes('dataset') ||
    h.includes('scrape') ||
    h.includes('scraper')
  ) {
    return MESSAGES.scraper;
  }

  // 4. AI / model failures.
  if (
    h.includes('anthropic') ||
    h.includes('openai') ||
    h.includes('claude') ||
    h.includes('model') ||
    h.includes('completion') ||
    h.includes('overloaded') ||
    h.includes('llm')
  ) {
    return MESSAGES.ai;
  }

  // 5. Anything else.
  return MESSAGES.fallback;
}

export function toFriendlyError(err: unknown): FriendlyError {
  try {
    const { haystack, logDetail } = extract(err);
    return {
      userMessage: classify(haystack),
      logDetail: logDetail || '[no error detail]',
    };
  } catch {
    // Defensive: toFriendlyError must never throw.
    return {
      userMessage: MESSAGES.fallback,
      logDetail: '[failed to read error]',
    };
  }
}
