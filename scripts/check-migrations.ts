/**
 * Fails loudly if the live database is missing any object the app depends on —
 * i.e. a migration was merged in code but never applied. Run after deploy:
 *
 *   npm run check:migrations
 *
 * It calls the read-only public.migration_health() function (migration 0010)
 * with the service-role key and exits non-zero if anything is missing.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// This runs outside Next, so .env.local isn't auto-loaded — read it ourselves
// (without adding a dotenv dependency). Real env vars take precedence.
function loadEnvLocal(): void {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in .env.local or the environment).');
    process.exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase.rpc('migration_health');
  if (error) {
    console.error('✖ Could not run migration_health().');
    console.error('  → Has migration 0010_migration_health.sql been applied to this database?');
    console.error('   ', error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as { object: string; present: boolean }[];
  let missing = 0;
  for (const r of rows) {
    console.log(`${r.present ? '✅' : '❌ MISSING'}  ${r.object}`);
    if (!r.present) missing += 1;
  }

  if (missing > 0) {
    console.error(`\n✖ ${missing} expected object(s) missing — a migration was merged but never applied.`);
    console.error('  Apply the pending migration SQL in the Supabase SQL editor, then re-run this check.');
    process.exit(1);
  }
  console.log(`\n✅ All ${rows.length} expected database objects are present.`);
}

main().catch((err) => {
  console.error('✖ check:migrations failed unexpectedly:', err);
  process.exit(1);
});
