-- supabase/migrations/0009_saved_leads_unique.sql
--
-- Stop duplicate saved rows for the same lead.
--
-- /api/app/saved (POST) de-dupes with a check-then-insert: it looks up an
-- existing (user_id, lead->>'id') row and inserts only if none is found. Two
-- concurrent requests (a double-click, or the same lead saved from two tabs)
-- can both pass the "does it exist?" check before either insert commits, so
-- both insert — creating two identical saved_leads rows.
--
-- Fix: a real unique constraint on (user_id, lead id). The route additionally
-- treats the resulting unique-violation (23505) as an idempotent success.

-- First remove any duplicates already created by the race, keeping the
-- earliest saved row per (user, lead id). The ctid tiebreaker handles the rare
-- case of identical saved_at timestamps so the index build below can't fail.
delete from public.saved_leads a
using public.saved_leads b
where a.user_id = b.user_id
  and a.lead->>'id' = b.lead->>'id'
  and (a.saved_at > b.saved_at or (a.saved_at = b.saved_at and a.ctid > b.ctid));

create unique index if not exists saved_leads_user_lead_id
  on public.saved_leads (user_id, (lead->>'id'));
