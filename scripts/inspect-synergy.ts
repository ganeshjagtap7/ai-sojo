/**
 * One-off: dump the Synergy Business Brokers list page + one detail page so we
 * can write accurate selectors (incl. the broker contact block).
 *
 * Run:  npx tsx scripts/inspect-synergy.ts
 *
 * Writes synergy-list.html + synergy-detail.html (git-ignored).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://synergybb.com/businesses-for-sale/';
const DETAIL_URL = 'https://synergybb.com/listings/og-specialty-equipment-rental-trucking-tx/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // --- list ---
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Annual Revenue', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const listHtml = await page.content();
  writeFileSync(join(process.cwd(), 'synergy-list.html'), listHtml);
  console.log(`\n[list] wrote ${listHtml.length} bytes`);
  console.log(`  /listings/ links    : ${await page.locator('a[href*="/listings/"]').count()}`);
  console.log(`  "Annual Revenue"    : ${await page.locator('text=Annual Revenue').count()}`);
  console.log(`  pagination (page)   : ${await page.locator('a[href*="page"]').count()}`);

  // --- detail ---
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=EBITDA', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const detailHtml = await page.content();
  writeFileSync(join(process.cwd(), 'synergy-detail.html'), detailHtml);
  console.log(`\n[detail] wrote ${detailHtml.length} bytes`);
  for (const t of ['EBITDA', 'Employees', 'Reason For Sale', 'Asking Price', 'M&A Broker']) {
    console.log(`    "${t}": ${await page.locator(`text=${t}`).count()}`);
  }
  console.log(`    mailto: links : ${await page.locator('a[href^="mailto:"]').count()}`);
  console.log(`    tel: links    : ${await page.locator('a[href^="tel:"]').count()}`);

  await browser.close();
  console.log('\nDone. Say "done" and I will read both files.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
