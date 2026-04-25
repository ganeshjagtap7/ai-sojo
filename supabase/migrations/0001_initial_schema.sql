-- =============================================================================
-- Initial schema for Sojo: profiles, theses, searches, saved_leads
--
-- Apply via Supabase dashboard SQL editor, or `supabase db push` if using the
-- CLI. Idempotent against a fresh project; will fail if any of these tables
-- already exist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user. Auto-created via trigger below.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  archetype   text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: own row read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: own row update"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth.users row appears.
-- Keeps email in sync from Supabase Auth so we don't have to backfill.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- theses: at most one is_active = true per user.
--
-- Spec wrote `unique (user_id, is_active) deferrable initially deferred` but
-- that would forbid two is_active=false rows for the same user, breaking the
-- "soft-deactivate keeps history" requirement. Partial unique index is the
-- right shape — only enforces uniqueness on active rows.
-- -----------------------------------------------------------------------------
create table public.theses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  headline        text,
  paragraph       text,
  buckets         jsonb,
  facts           jsonb,
  disqualifiers   text[],
  sharpening      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index theses_one_active_per_user
  on public.theses (user_id)
  where is_active;

create index theses_user_id_idx on public.theses (user_id);

alter table public.theses enable row level security;

create policy "theses: own rows read"
  on public.theses for select
  using (auth.uid() = user_id);

create policy "theses: own rows insert"
  on public.theses for insert
  with check (auth.uid() = user_id);

create policy "theses: own rows update"
  on public.theses for update
  using (auth.uid() = user_id);

create policy "theses: own rows delete"
  on public.theses for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- searches: one row per search thread (initial or refined).
-- -----------------------------------------------------------------------------
create table public.searches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  thesis_id         uuid not null references public.theses(id) on delete cascade,
  query             text,
  leads             jsonb,
  search_metadata   jsonb,
  status            text not null default 'running',
  created_at        timestamptz not null default now()
);

create index searches_thesis_id_idx on public.searches (thesis_id, created_at desc);
create index searches_user_id_idx on public.searches (user_id, created_at desc);

alter table public.searches enable row level security;

create policy "searches: own rows read"
  on public.searches for select
  using (auth.uid() = user_id);

create policy "searches: own rows insert"
  on public.searches for insert
  with check (auth.uid() = user_id);

create policy "searches: own rows update"
  on public.searches for update
  using (auth.uid() = user_id);

create policy "searches: own rows delete"
  on public.searches for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- saved_leads: per-lead CRM state. De-dupe by (user_id, lead_id) at app level.
-- -----------------------------------------------------------------------------
create table public.saved_leads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  search_id   uuid references public.searches(id) on delete set null,
  lead        jsonb not null,
  stage       text not null default 'New',
  saved_at    timestamptz not null default now()
);

create index saved_leads_user_id_idx on public.saved_leads (user_id, saved_at desc);

alter table public.saved_leads enable row level security;

create policy "saved_leads: own rows read"
  on public.saved_leads for select
  using (auth.uid() = user_id);

create policy "saved_leads: own rows insert"
  on public.saved_leads for insert
  with check (auth.uid() = user_id);

create policy "saved_leads: own rows update"
  on public.saved_leads for update
  using (auth.uid() = user_id);

create policy "saved_leads: own rows delete"
  on public.saved_leads for delete
  using (auth.uid() = user_id);
