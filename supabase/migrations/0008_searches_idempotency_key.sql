-- supabase/migrations/0008_searches_idempotency_key.sql
--
-- Give search-result saves an idempotency key so a client retry can't create a
-- duplicate row.
--
-- /api/app/searches did a plain INSERT. If the client's persist request times
-- out or the connection drops AFTER the server already committed, a retry
-- (automatic, or the user re-running the search) re-POSTs the same payload and
-- inserts a second, fully duplicate row with a new id — inflating the user's
-- search history.
--
-- Fix: a client-generated UUID per search attempt. The route upserts with
-- ON CONFLICT DO NOTHING on (user_id, idempotency_key), so a retry that reuses
-- the key resolves to the row the first request already committed.
--
-- The column is nullable (existing rows predate it) and the unique index is
-- NOT partial: Postgres treats NULLs as distinct, so historical key-less rows
-- never collide with each other, while every new keyed save dedupes. A plain
-- (non-partial) index is also what PostgREST's on-conflict arbiter can infer.
alter table public.searches
  add column if not exists idempotency_key uuid;

create unique index if not exists searches_user_idempotency_key
  on public.searches (user_id, idempotency_key);
