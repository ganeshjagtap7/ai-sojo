-- Atomic "make this the user's active thesis".
--
-- /api/onboard previously did two separate statements: (1) deactivate the
-- existing active thesis, then (2) insert the new one. If the insert failed in
-- between, the user was left with NO active thesis (orphaned). A code-only
-- "insert first, then deactivate" doesn't work here because the partial unique
-- index `theses_one_active_per_user` forbids a second is_active=true row — the
-- insert would fail immediately. So the correct fix is a single transaction.
--
-- A plpgsql function runs in one implicit transaction: if the insert raises,
-- the deactivate rolls back too. Uses auth.uid() (SECURITY INVOKER, so RLS and
-- the caller's identity apply) rather than trusting a passed-in user id.
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
end;
$$;

grant execute on function public.set_active_thesis(text, text, text, text[], jsonb, jsonb)
  to authenticated;
