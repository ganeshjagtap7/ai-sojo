/**
 * One-off: dump the rendered HTML of the AppPeak listings page so we can write
 * accurate selectors. AppPeak is public — no login needed.
 *
 * Run:  npx tsx scripts/inspect-apppeak.ts
 *
 * Writes apppeak-listings.html to the project root (git-ignored) + diagnostics.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const URL = 'https://listings.apppeak.com/listings';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Wait for the listing cards to actually render (client-side).
  await page.waitForSelector('text=Asking Price', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const html = await page.content();
  const out = join(process.cwd(), 'apppeak-listings.html');
  writeFileSync(out, html);
  console.log(`wrote ${html.length} bytes -> ${out}`);
  console.log(`  "Asking Price" matches : ${await page.locator('text=Asking Price').count()}`);
  console.log(`  "View Dataroom"        : ${await page.locator('text=View Dataroom').count()}`);
  console.log(`  "Contact Seller"       : ${await page.locator('text=Contact Seller').count()}`);

  await browser.close();
  console.log('\nDone. Say "done" and I will read apppeak-listings.html.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
