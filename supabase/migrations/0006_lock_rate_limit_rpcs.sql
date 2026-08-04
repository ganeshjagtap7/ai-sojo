-- supabase/migrations/0006_lock_rate_limit_rpcs.sql
--
-- Security fix. increment_daily_usage / decrement_daily_usage are SECURITY
-- DEFINER and take p_user_id as a *trusted* parameter (they write to whatever
-- user id they're handed). With Postgres's default PUBLIC execute grant, any
-- signed-in client could call them directly with an arbitrary p_user_id —
-- bypassing lib/ratelimit.ts to reset their own daily quota or grief another
-- user's counter.
--
-- These functions are only ever invoked server-side via the service-role client
-- (lib/ratelimit.ts, which already passes the real user id). So the correct fix
-- is to make them callable by service_role ONLY. (An auth.uid() guard would not
-- work here: the legit caller is service-role, where auth.uid() is null.)

revoke execute on function public.increment_daily_usage(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.decrement_daily_usage(uuid, text)      from public, anon, authenticated;

grant execute on function public.increment_daily_usage(uuid, text, int) to service_role;
grant execute on function public.decrement_daily_usage(uuid, text)      to service_role;
