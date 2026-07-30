import { createServiceClient } from '@/lib/supabase/service';

/** The gated endpoints — each carries its own independent daily budget. */
export type RateLimitKey = 'search' | 'chat' | 'thesis' | 'refine';

/**
 * Per-endpoint daily caps (UTC day). Each is read from `RATE_LIMIT_<KEY>` and
 * falls back to the baked default below. Splitting the budget per endpoint
 * means a chatty onboarding (many /api/chat turns) can't exhaust the quota for
 * the expensive /api/search path — the failure mode of the old single shared
 * counter. Chat gets a deliberately higher cap because it's called once per
 * conversation turn, whereas search/thesis are called once per result.
 */
const DEFAULT_LIMITS: Record<RateLimitKey, number> = {
  search: 25,
  chat: 100,
  thesis: 25,
  // Refine is one cheap generateText per submit, but it was the only
  // model-calling route with NO cap. 50/day is far above real usage.
  refine: 50,
};

function limitFor(key: RateLimitKey): number {
  const fromEnv = parseInt(process.env[`RATE_LIMIT_${key.toUpperCase()}`] ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_LIMITS[key];
}

/**
 * Atomically increments and checks a per-user, per-day (UTC), per-endpoint
 * usage counter.
 *
 * Serverless-safe: the counter lives in Postgres via the
 * `increment_daily_usage` RPC (a single atomic upsert-and-return), NOT in an
 * in-memory Map — each Vercel lambda has its own memory, so an in-process
 * counter would be wrong (the same class of bug that broke the old jobStore).
 *
 * Uses the service-role client so the write isn't blocked by RLS.
 *
 * Note: this increments on every call (including the call that trips the
 * limit). `allowed` is true only when the post-increment count is within the
 * limit. If the RPC fails we fail open (allow the request) rather than hard-
 * blocking users on a transient DB error. Pair with `refundRateLimit` to hand
 * the slot back when a counted request later fails through no fault of the user.
 */
export async function checkRateLimit(
  userId: string,
  key: RateLimitKey,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limit = limitFor(key);

  let data: unknown, error: unknown;
  try {
    const supabase = createServiceClient();
    ({ data, error } = await supabase.rpc('increment_daily_usage', {
      p_user_id: userId,
      p_key: key,
      p_limit: limit,
    }));
  } catch (err) {
    // createServiceClient throws on missing env — a config error, not a
    // transient one. Still fail open (never lock users out over our own
    // misconfig) but make the cause unmissable in the function logs.
    console.error(`[ratelimit] SERVICE CLIENT MISCONFIGURED — quota NOT enforcing (key=${key}):`, err);
    return { allowed: true, remaining: limit, limit };
  }

  if (error || typeof data !== 'number') {
    // Fail open on transient errors so a DB hiccup doesn't lock everyone out.
    // If this appears on every request, check SUPABASE_SERVICE_ROLE_KEY and
    // that migrations 0002/0003 (increment_daily_usage RPC) are applied.
    console.error(`[ratelimit] increment_daily_usage failed — quota NOT enforcing (key=${key}):`, error);
    return { allowed: true, remaining: limit, limit };
  }

  const count = data;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), limit };
}

/**
 * Hand back one unit of quota for (user, key) on the current UTC day. Call this
 * when a request was counted by `checkRateLimit` but then failed for a reason
 * that isn't the user's fault (scraper crash, model outage) — so a failed
 * attempt doesn't permanently burn a daily slot. Best-effort and never throws:
 * a refund failure just means the user keeps the (already-counted) usage.
 */
export async function refundRateLimit(userId: string, key: RateLimitKey): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc('decrement_daily_usage', {
      p_user_id: userId,
      p_key: key,
    });
    if (error) console.error(`[ratelimit] decrement_daily_usage failed (key=${key}):`, error);
  } catch (err) {
    console.error(`[ratelimit] refund threw (key=${key}):`, err);
  }
}
