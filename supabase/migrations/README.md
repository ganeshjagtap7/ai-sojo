# Database migrations

These `.sql` files are **not applied automatically.** There is no migration
runner — each file must be run **by hand in the Supabase SQL editor** against
the live database. A file merged in code does nothing until it's run.

Skipping this is how features break silently: if a migration adds a function
the app calls (e.g. `set_active_thesis`, `increment_daily_usage`) and it was
never applied, the app fails quietly — no loud error.

## When you add or merge a migration

1. Open the Supabase **SQL editor** (production project).
2. Paste the new migration file's SQL and **Run** it. Apply files **in order**
   (`0007` before `0008`, …).
3. If the migration adds an object the app depends on, add a matching row to
   `public.migration_health()` in `0010_migration_health.sql` (in your new
   migration) so the check below covers it.
4. Confirm nothing was missed:

   ```bash
   npm run check:migrations
   ```

   It calls the read-only `migration_health()` function with the service-role
   key and prints ✅ / ❌ for every expected object, exiting non-zero if any is
   missing. Run it **after every deploy**.

## First-time setup

`0010_migration_health.sql` must be applied once for `npm run check:migrations`
to work. If the check reports it can't find `migration_health()`, apply `0010`
first.

## Env

`check:migrations` reads `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (from `.env.local` or the environment). Point them
at whichever database you want to verify (prod vs. a preview).
