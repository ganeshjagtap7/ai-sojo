/**
 * One-off: dump the Investors Club listings page + one detail page so we can
 * write accurate selectors.
 *
 * Run:  npx tsx scripts/inspect-investorsclub.ts
 *
 * Writes investorsclub-list.html + investorsclub-detail.html (git-ignored).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://investors.club/listings/';
const DETAIL_URL = 'https://investors.club/listing/72509-prefab-housing-ecommerce-store/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  // Headed in case of a Cloudflare/bot check.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // --- list page ---
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Asking Price', { timeout: 40000 }).catch(() => {});
  // Scroll in case listings lazy-load.
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
  }
  const listHtml = await page.content();
  writeFileSync(join(process.cwd(), 'investorsclub-list.html'), listHtml);
  console.log(`\n[list] wrote ${listHtml.length} bytes`);
  console.log(`  "Asking Price"   : ${await page.locator('text=Asking Price').count()}`);
  console.log(`  "Profit Multiple": ${await page.locator('text=Profit Multiple').count()}`);
  console.log(`  links /listing/  : ${await page.locator('a[href*="/listing/"]').count()}`);

  // --- detail page ---
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Asking Price', { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const detailHtml = await page.content();
  writeFileSync(join(process.cwd(), 'investorsclub-detail.html'), detailHtml);
  console.log(`\n[detail] wrote ${detailHtml.length} bytes`);
  console.log(`  "Annual Gross Revenue": ${await page.locator('text=Annual Gross Revenue').count()}`);

  await browser.close();
  console.log('\nDone. Say "done" and I will read both files.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
