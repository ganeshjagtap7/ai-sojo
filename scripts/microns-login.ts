/**
 * One-time interactive login for Microns (data is gated behind login).
 *
 * Run:  npx tsx scripts/microns-login.ts
 *
 * Opens a browser. Log into app.microns.io, open the listings and confirm the
 * data is visible, then press ENTER. Saves your session to microns-auth.json
 * (git-ignored) for the scraper to reuse.
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { createInterface } from 'readline';

const AUTH_FILE = join(process.cwd(), 'microns-auth.json');

function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  console.log('Opening a browser window…');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://app.microns.io/buyer/listings', { waitUntil: 'domcontentloaded' });

  console.log('\n──────────────────────────────────────────────────────────');
  console.log('  1. Log into Microns in the browser window.');
  console.log('  2. Open the listings and confirm prices/metrics are visible.');
  console.log('  3. Come back here and press ENTER to save the session.');
  console.log('──────────────────────────────────────────────────────────\n');

  await waitForEnter('Press ENTER once logged in… ');
  await context.storageState({ path: AUTH_FILE });
  await browser.close();
  console.log(`\n✓ Session saved to ${AUTH_FILE}`);
  console.log('Now run:  npx tsx scripts/inspect-microns.ts');
}

main().catch((err) => {
  console.error('Login helper failed:', err);
  process.exit(1);
});
