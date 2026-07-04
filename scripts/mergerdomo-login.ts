/**
 * One-time interactive login for MergerDomo. Opens a real browser; you log in
 * by hand (email/OTP/whatever), then it saves the session to mergerdomo-auth.json
 * so the scraper can read the gated detail pages. No password is stored — only
 * the resulting session cookies/localStorage.
 *
 * Run:  npx tsx scripts/mergerdomo-login.ts
 * Then log in in the window. Once you see your Dashboard/Logout, it auto-saves.
 * (If auto-detect misses, just press Enter in this terminal to save manually.)
 */
import { chromium } from 'playwright';
import { join } from 'path';
import * as readline from 'readline';

const HOME = 'https://mergerdomo.com/';
const AUTH = join(process.cwd(), 'mergerdomo-auth.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('\n>>> Log in to MergerDomo in the browser window.');
  console.log('>>> When you can see your Dashboard / Logout, it will save automatically.');
  console.log('>>> (Or press Enter here any time to save the current session.)\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const onEnter = new Promise<void>((resolve) => rl.question('', () => resolve()));
  const onLoggedIn = page
    .waitForSelector('text=Logout', { timeout: 300000 })
    .then(() => undefined)
    .catch(() => undefined);

  await Promise.race([onEnter, onLoggedIn]);
  rl.close();

  const state = await context.storageState({ path: AUTH });
  console.log(`\n✓ Saved session to ${AUTH}`);
  await browser.close();

  // Print the serialized cookie string to paste into MERGERDOMO_COOKIES
  // (Phase 3: production reads it from env instead of the session file).
  const cookieStr = (state.cookies || [])
    .filter((c) => (c.domain ?? '').includes('mergerdomo.com'))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (cookieStr) {
    console.log('\nFor production (.env.local / Vercel), set:');
    console.log(`  MERGERDOMO_COOKIES=${cookieStr}`);
  } else {
    console.log('\n(No mergerdomo.com cookies found — log in fully, then re-run to capture MERGERDOMO_COOKIES.)');
  }
}

main().catch((err) => {
  console.error('Login failed:', err);
  process.exit(1);
});
