-- =============================================================================
-- Per-user daily rate limiting for search / chat / thesis endpoints.
--
-- Apply via Supabase dashboard SQL editor, or `supabase db push` if using the
-- CLI. Depends on 0001_initial_schema.sql (auth.users). Fully idempotent —
-- safe to re-run even if a previous run partially applied (e.g. the table got
-- created but the policy/function did not).
--
-- The counter lives in Postgres (not in-process memory) so it is correct
-- across serverless instances — each Vercel lambda has its own memory, which
-- is exactly the bug that broke the old in-memory jobStore.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- usage_counters: one row per (user, UTC day). Incremented on each gated call.
-- -----------------------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id     uuid not null references auth.users(id) on delete cascade,
  usage_date  date not null default (now() at time zone 'utc')::date,
  count       int  not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists usage_counters_user_id_idx on public.usage_counters (user_id);

alter table public.usage_counters enable row level security;

-- Reads of own usage are allowed. Writes go exclusively through the
-- SECURITY DEFINER function below (called with the service role), so no
-- insert/update policy is needed — and omitting them prevents clients from
-- tampering with their own counters.
drop policy if exists "usage_counters: own rows read" on public.usage_counters;
create policy "usage_counters: own rows read"
  on public.usage_counters for select
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- increment_daily_usage: atomic upsert-and-return for the current UTC day.
--
-- Single round-trip, race-free: the upsert and the read of the post-increment
-- count happen in one statement, so concurrent calls can't both read a stale
-- value (unlike a read-then-write from JS). p_limit is informational only —
-- the function always increments and returns the new count; the caller decides
-- whether the new count exceeds the limit. Mirrors the style of
-- handle_new_user in 0001 (security definer + pinned search_path).
-- -----------------------------------------------------------------------------
create or replace function public.increment_daily_usage(
  p_user_id uuid,
  p_limit   int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.usage_counters (user_id, usage_date, count)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date)
    do update set count = public.usage_counters.count + 1
  returning count into v_count;

  return v_count;
end;
$$;
