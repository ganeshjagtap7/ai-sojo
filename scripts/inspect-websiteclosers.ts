/**
 * One-off: dump the Website Closers list page + one detail page so we can write
 * accurate selectors and decide whether financials are on the cards or only on
 * the detail pages.
 *
 * Run:  npx tsx scripts/inspect-websiteclosers.ts
 *
 * Writes websiteclosers-list.html + websiteclosers-detail.html (git-ignored).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://www.websiteclosers.com/businesses-for-sale/';
const DETAIL_URL =
  'https://www.websiteclosers.com/businesses/lender-pre-qualified-industrial-magnetic-equipment-company-50-repeat-order-rate-42-net-margin-zero-ad-spend-semi-absentee/119091/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  // Headed in case Cloudflare/bot-check is present (like Quiet Light).
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // --- list page ---
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('a[href*="/businesses/"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const listHtml = await page.content();
  writeFileSync(join(process.cwd(), 'websiteclosers-list.html'), listHtml);
  console.log(`\n[list] wrote ${listHtml.length} bytes`);
  console.log(`  detail links (/businesses/) : ${await page.locator('a[href*="/businesses/"]').count()}`);
  console.log(`  "Asking Price" on list      : ${await page.locator('text=Asking Price').count()}`);
  console.log(`  "Cash Flow" on list         : ${await page.locator('text=Cash Flow').count()}`);
  console.log(`  pagination links (?_paged/page): ${await page.locator('a[href*="page"]').count()}`);

  // --- detail page ---
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Asking Price', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const detailHtml = await page.content();
  writeFileSync(join(process.cwd(), 'websiteclosers-detail.html'), detailHtml);
  console.log(`\n[detail] wrote ${detailHtml.length} bytes`);
  console.log(`  "Asking Price" on detail    : ${await page.locator('text=Asking Price').count()}`);

  await browser.close();
  console.log('\nDone. Say "done" and I will read both files.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
