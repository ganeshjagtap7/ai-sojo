-- supabase/migrations/0007_set_active_thesis_idempotent.sql
--
-- Make set_active_thesis (0004) idempotent under concurrent submits.
--
-- The function deactivates the current active thesis then inserts a new
-- is_active=true row. Two concurrent calls (a double-clicked "Save", or a
-- client retry after a slow response) race: the first commits, and the
-- second's insert then violates the `theses_one_active_per_user` partial
-- unique index and raises. /api/onboard surfaced that as a raw 500 —
-- "Failed to persist thesis: ..." — even though a thesis WAS created by the
-- first request. The user sees a failure for an operation that actually
-- succeeded and may retry, muddying which thesis is active.
--
-- Fix: catch the unique_violation inside the function. On conflict the block's
-- own changes (the deactivate + the failed insert) roll back to the implicit
-- savepoint, and we return the thesis that the winning concurrent call left
-- active — turning the loser into a successful no-op instead of an error.
-- SECURITY INVOKER (default) and auth.uid() are unchanged from 0004.
create or replace function public.set_active_thesis(
  p_headline      text,
  p_paragraph     text,
  p_sharpening    text,
  p_disqualifiers text[],
  p_buckets       jsonb,
  p_facts         jsonb
) returns uuid
language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.theses
    set is_active = false
    where user_id = v_user_id and is_active;

  insert into public.theses
    (user_id, headline, paragraph, sharpening, disqualifiers, buckets, facts, is_active)
  values
    (v_user_id, p_headline, p_paragraph, p_sharpening,
     coalesce(p_disqualifiers, '{}'), coalesce(p_buckets, '{}'::jsonb),
     coalesce(p_facts, '{}'::jsonb), true)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    -- A concurrent call already created/activated a thesis for this user. Our
    -- deactivate + insert rolled back; report the surviving active thesis as a
    -- successful no-op rather than a 500.
    select id into v_id
      from public.theses
      where user_id = v_user_id and is_active
      order by created_at desc
      limit 1;
    return v_id;
end;
$$;

grant execute on function public.set_active_thesis(text, text, text, text[], jsonb, jsonb)
  to authenticated;
