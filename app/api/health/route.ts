import { createServiceClient } from '@/lib/supabase/service';

// Active health probe for external monitoring (GitHub Actions cron). It checks
// the two dependencies that have silently taken the product down — the Supabase
// database (paused/unreachable) and the Apify scraping quota (exhausted) — so an
// alert fires the same day, not a week later when someone tests by hand.
//
// Route handlers aren't cached by default, but force-dynamic makes it explicit:
// every probe must actually hit the DB and Apify, never a prerendered response.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TIMEOUT_MS = 8000;
// Alert while there's still headroom, not only once the quota is fully dry.
const APIFY_WARN_PCT = Number(process.env.APIFY_QUOTA_WARN_PCT ?? 90);

type CheckStatus = 'ok' | 'warn' | 'fail';
interface Check {
  status: CheckStatus;
  detail: string;
}

// The database is the hard dependency: if it's down, the whole product is down.
async function checkDb(): Promise<Check> {
  try {
    const supabase = createServiceClient();
    // Cheapest possible liveness query — a HEAD count on a known table, aborted
    // fast so a paused/unreachable DB fails quickly instead of hanging the probe.
    const { error } = await supabase
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) return { status: 'fail', detail: `db query failed: ${error.message}` };
    return { status: 'ok', detail: 'database responded' };
  } catch (e) {
    return { status: 'fail', detail: `db unreachable: ${(e as Error).message}` };
  }
}

// Apify is best-effort: we only flip to warn/fail when we can CONFIDENTLY read a
// usage figure over the threshold. If the token is missing, or the limits API is
// unreachable, or its shape is unexpected, we stay 'ok' with an explanatory note
// rather than cry wolf — the DB check is the reliable hard signal.
async function checkApify(): Promise<Check> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return { status: 'ok', detail: 'quota not checked (APIFY_API_TOKEN unset)' };
  try {
    const res = await fetch('https://api.apify.com/v2/users/me/limits', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { status: 'ok', detail: `apify limits check inconclusive (HTTP ${res.status})` };
    const json = (await res.json()) as {
      data?: { current?: Record<string, unknown>; limits?: Record<string, unknown> };
    };
    const used = json.data?.current?.monthlyUsageUsd;
    const max = json.data?.limits?.maxMonthlyUsageUsd;
    if (typeof used === 'number' && typeof max === 'number' && max > 0) {
      const pct = Math.round((used / max) * 100);
      const money = `$${used.toFixed(0)}/$${max.toFixed(0)}`;
      if (pct >= 100) return { status: 'fail', detail: `apify quota exhausted (${pct}%, ${money})` };
      if (pct >= APIFY_WARN_PCT) return { status: 'warn', detail: `apify usage ${pct}% (${money}) — approaching limit` };
      return { status: 'ok', detail: `apify usage ${pct}% (${money})` };
    }
    return { status: 'ok', detail: 'apify reachable (usage fields unavailable)' };
  } catch (e) {
    return { status: 'ok', detail: `apify limits check inconclusive: ${(e as Error).message}` };
  }
}

export async function GET(request: Request) {
  // Optional shared-secret guard: the probe touches the DB + Apify, so if
  // HEALTH_CHECK_SECRET is set on the server we require ?key=<secret>. Unset =
  // open (zero-config); the checks are cheap either way.
  const secret = process.env.HEALTH_CHECK_SECRET;
  if (secret) {
    const key = new URL(request.url).searchParams.get('key');
    if (key !== secret) {
      return Response.json({ status: 'unauthorized' }, { status: 401 });
    }
  }

  const [db, apify] = await Promise.all([checkDb(), checkApify()]);
  const checks = { db, apify };

  const anyFail = Object.values(checks).some((c) => c.status === 'fail');
  const anyWarn = Object.values(checks).some((c) => c.status === 'warn');
  const status = anyFail ? 'down' : anyWarn ? 'degraded' : 'ok';

  // 503 only when something is actually broken (DB down / quota exhausted). A
  // 'degraded' (e.g. quota approaching) stays 200 but is flagged so the monitor
  // can still alert on it.
  return Response.json(
    { status, checks, checkedAt: new Date().toISOString() },
    { status: anyFail ? 503 : 200 },
  );
}
