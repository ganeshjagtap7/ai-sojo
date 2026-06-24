/**
 * One-time interactive login for startupa.ge.
 *
 * Run:  npx tsx scripts/startupage-login.ts
 *
 * Opens a real Chrome window. Log into startupa.ge normally (Google, email,
 * whatever you use). Once you can see your dashboard, come back to the terminal
 * and press ENTER. Your session is saved to startupage-auth.json (git-ignored),
 * and the scraper reuses it — no cookie copy-paste, no extension needed.
 *
 * Re-run this only when the saved session expires (scraper will tell you).
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { createInterface } from 'readline';

const AUTH_FILE = join(process.cwd(), 'startupage-auth.json');
const START_URL = 'https://startupa.ge/';

function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  console.log('Opening a browser window…');
  // headless: false so you can see and interact with the login form.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

  console.log('\n──────────────────────────────────────────────────────────');
  console.log('  1. In the browser window, LOG IN to startupa.ge.');
  console.log('  2. Make sure you can see your logged-in dashboard.');
  console.log('  3. Come back here and press ENTER to save the session.');
  console.log('──────────────────────────────────────────────────────────\n');

  await waitForEnter('Press ENTER once you are logged in… ');

  await context.storageState({ path: AUTH_FILE });
  await browser.close();

  console.log(`\n✓ Session saved to ${AUTH_FILE}`);
  console.log('You can now run:  npx tsx scripts/test-startupage.ts');
}

main().catch((err) => {
  console.error('Login helper failed:', err);
  process.exit(1);
});
