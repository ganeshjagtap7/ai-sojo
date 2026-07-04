/**
 * One-off: dump the rendered HTML of the Quiet Light listings page so we can
 * write accurate selectors. Quiet Light is public — no login needed.
 *
 * Run:  npx tsx scripts/inspect-quietlight.ts
 *
 * Writes quietlight-listings.html to the project root (git-ignored) + diagnostics.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const URL = 'https://quietlight.com/listings/';

async function main() {
  // Quiet Light is behind Cloudflare's "Just a moment" bot check. A visible
  // (headed) browser with a realistic UA usually clears it automatically.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for the Cloudflare check to clear and the listings to render.
  console.log('Waiting for Cloudflare check to clear (up to 45s)…');
  await page.waitForSelector('text=Revenue', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  // Scroll to the bottom a few times in case the board lazy-loads.
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
  }

  const html = await page.content();
  const out = join(process.cwd(), 'quietlight-listings.html');
  writeFileSync(out, html);
  console.log(`wrote ${html.length} bytes -> ${out}`);
  console.log(`  "Revenue" matches      : ${await page.locator('text=Revenue').count()}`);
  console.log(`  "Income" matches       : ${await page.locator('text=Income').count()}`);
  console.log(`  "Under Offer" matches  : ${await page.locator('text=Under Offer').count()}`);
  console.log(`  links to /listings/<x> : ${await page.locator('a[href*="/listings/"]').count()}`);

  await browser.close();
  console.log('\nDone. Say "done" and I will read quietlight-listings.html.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
