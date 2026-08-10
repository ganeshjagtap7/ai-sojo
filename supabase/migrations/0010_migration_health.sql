-- supabase/migrations/0010_migration_health.sql
--
-- Safeguard so a migration that was merged in code but never applied to the
-- live DB is caught loudly instead of the app failing silently (rate limiting
-- not enforcing, thesis save failing, etc.).
--
-- This read-only function reports whether every object the app depends on
-- actually exists. scripts/check-migrations.ts (npm run check:migrations)
-- calls it after deploy and fails loudly on anything missing.
--
-- When a future migration adds a new object the app relies on, add a row here
-- (in the same migration) so coverage stays current.
create or replace function public.migration_health()
returns table(object text, present boolean)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select 'fn  increment_daily_usage'::text,        exists(select 1 from pg_proc where proname = 'increment_daily_usage')
  union all select 'fn  decrement_daily_usage',         exists(select 1 from pg_proc where proname = 'decrement_daily_usage')
  union all select 'fn  set_active_thesis',             exists(select 1 from pg_proc where proname = 'set_active_thesis')
  union all select 'fn  activate_thesis',               exists(select 1 from pg_proc where proname = 'activate_thesis')
  union all select 'fn  handle_new_user',               exists(select 1 from pg_proc where proname = 'handle_new_user')
  union all select 'tbl usage_counters',                exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'usage_counters')
  union all select 'col usage_counters.usage_key',      exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'usage_counters' and column_name = 'usage_key')
  union all select 'col searches.idempotency_key',      exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'searches' and column_name = 'idempotency_key')
  union all select 'idx searches_user_idempotency_key', exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'searches_user_idempotency_key')
  union all select 'idx saved_leads_user_lead_id',      exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'saved_leads_user_lead_id');
$$;

-- Only the service-role client (used by the check script) needs to call it.
revoke execute on function public.migration_health() from public;
grant execute on function public.migration_health() to service_role;
