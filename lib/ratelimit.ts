import { createServiceClient } from '@/lib/supabase/service';

const DAILY_LIMIT = parseInt(process.env.DAILY_SEARCH_LIMIT || '25', 10);

/**
 * Atomically increments and checks a per-user, per-day (UTC) usage counter.
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
 * blocking users on a transient DB error.
 */
export async function checkRateLimit(
  userId: string,
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('increment_daily_usage', {
    p_user_id: userId,
    p_limit: DAILY_LIMIT,
  });

  if (error || typeof data !== 'number') {
    // Fail open on transient errors so a DB hiccup doesn't lock everyone out.
    console.error('[ratelimit] increment_daily_usage failed:', error);
    return { allowed: true, remaining: DAILY_LIMIT, limit: DAILY_LIMIT };
  }

  const count = data;
  const allowed = count <= DAILY_LIMIT;
  const remaining = Math.max(0, DAILY_LIMIT - count);

  return { allowed, remaining, limit: DAILY_LIMIT };
}
