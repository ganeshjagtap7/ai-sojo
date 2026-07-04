import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // A missing var previously produced a client that failed every call with an
  // opaque auth error, which callers like the rate limiter swallowed (fail-
  // open) — quota silently stopped enforcing (issue #9). Fail loudly instead.
  if (!url || !key) {
    throw new Error(
      `Supabase service client misconfigured: ${!url ? 'NEXT_PUBLIC_SUPABASE_URL ' : ''}${!key ? 'SUPABASE_SERVICE_ROLE_KEY' : ''} missing from env`,
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
