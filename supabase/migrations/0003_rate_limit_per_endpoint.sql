-- =============================================================================
-- Per-ENDPOINT daily rate limiting.
--
-- 0002 gave every user a single (user, UTC-day) counter shared across
-- /api/search, /api/chat and /api/thesis — so a multi-turn onboarding chat
-- could exhaust the budget for the expensive search path before the user ever
-- ran a search. This migration adds a `usage_key` dimension (the endpoint name)
-- so each endpoint has its own independent daily budget, plus a refund path so
-- a counted request that later fails through no fault of the user doesn't
-- permanently burn a slot.
--
-- Apply via the Supabase SQL editor or `supabase db push`. Depends on
-- 0002_rate_limit.sql. Fully idempotent — safe to re-run.
-- =============================================================================

-- 1. Add the endpoint dimension. Existing rows fall into the 'global' bucket,
--    which is harmless (nothing reads it after this migration).
alter table public.usage_counters
  add column if not exists usage_key text not null default 'global';

-- 2. Widen the primary key to (user_id, usage_date, usage_key). Guarded so the
--    migration is idempotent and only rebuilds the PK when it isn't already the
--    3-column form.
do $$
declare
  v_cols int;
begin
  select array_length(conkey, 1) into v_cols
  from pg_constraint
  where conname = 'usage_counters_pkey'
    and conrelid = 'public.usage_counters'::regclass;

  if v_cols is null then
    alter table public.usage_counters
      add constraint usage_counters_pkey primary key (user_id, usage_date, usage_key);
  elsif v_cols <> 3 then
    alter table public.usage_counters drop constraint usage_counters_pkey;
    alter table public.usage_counters
      add constraint usage_counters_pkey primary key (user_id, usage_date, usage_key);
  end if;
end $$;

-- 3. Replace the increment RPC with a per-key version. Drop the old 2-arg
--    signature first — create-or-replace can't change the argument list, so it
--    would otherwise leave a stale 2-arg overload behind.
drop function if exists public.increment_daily_usage(uuid, int);

create or replace function public.increment_daily_usage(
  p_user_id uuid,
  p_key     text,
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
  insert into public.usage_counters (user_id, usage_date, usage_key, count)
  values (p_user_id, (now() at time zone 'utc')::date, p_key, 1)
  on conflict (user_id, usage_date, usage_key)
    do update set count = public.usage_counters.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- 4. Refund one unit for (user, key) on the current UTC day, floored at 0.
--    Called when a counted request later fails for a reason that isn't the
--    user's fault, so an outage doesn't burn their daily slot. A no-op (returns
--    0) if there's no row yet — you can't refund what was never counted.
create or replace function public.decrement_daily_usage(
  p_user_id uuid,
  p_key     text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.usage_counters
     set count = greatest(0, count - 1)
   where user_id = p_user_id
     and usage_date = (now() at time zone 'utc')::date
     and usage_key = p_key
  returning count into v_count;

  return coalesce(v_count, 0);
end;
$$;
