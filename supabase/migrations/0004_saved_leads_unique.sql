-- =============================================================================
-- Enforce (user_id, lead->>'id') uniqueness on saved_leads at the DB level.
--
-- 0001 left de-duplication to the app ("De-dupe by (user_id, lead_id) at app
-- level"), but the app's check-then-insert races: two concurrent saves (double
-- click, two tabs) both pass the existence check and both insert. The unique
-- index closes the race; the API treats a 23505 on insert as an idempotent
-- "already saved".
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. Remove existing duplicates, keeping the earliest saved row per
--    (user_id, lead id). Ties on saved_at break deterministically by id.
delete from public.saved_leads a
using public.saved_leads b
where a.user_id = b.user_id
  and (a.lead->>'id') = (b.lead->>'id')
  and (b.saved_at < a.saved_at or (b.saved_at = a.saved_at and b.id < a.id));

-- 2. The unique index the app relies on.
create unique index if not exists saved_leads_user_lead_id_uidx
  on public.saved_leads (user_id, (lead->>'id'));
