-- supabase/migrations/0005_activate_thesis.sql
--
-- Atomic "switch my active thesis to this one". The /api/app/theses POST used
-- to run deactivate-then-activate as two statements; a failure in between left
-- the user with NO active thesis (workspace kicks them back into onboarding).
-- One plpgsql function = one implicit transaction. SECURITY INVOKER (the
-- default) keeps RLS and auth.uid() in force, same as set_active_thesis (0004).
create or replace function public.activate_thesis(p_thesis_id uuid)
returns void
language plpgsql
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.theses where id = p_thesis_id and user_id = v_user_id
  ) then
    raise exception 'thesis not found';
  end if;

  -- Deactivate first so the partial unique index (one is_active per user)
  -- can't conflict; both statements roll back together on any error.
  update public.theses
    set is_active = false
    where user_id = v_user_id and is_active and id <> p_thesis_id;

  update public.theses
    set is_active = true
    where id = p_thesis_id and user_id = v_user_id;
end;
$$;

grant execute on function public.activate_thesis(uuid) to authenticated;
