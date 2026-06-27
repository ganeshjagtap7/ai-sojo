/**
 * One-off: capture the BusinessDeals.in pagination AJAX call (POST to
 * /pagination/fetch_data) — its method, headers, body, and response — so we can
 * replay it for every page. Also dumps the response rows for selector-writing.
 *
 * Run:  npx tsx scripts/inspect-businessdeals.ts
 *
 * Writes businessdeals-page.html (the rows fragment) — git-ignored.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://businessdeals.in/businesses-for-sale-and-investment-opportunities';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  let captured = false;
  page.on('request', (req) => {
    if (req.url().includes('fetch_data')) {
      console.log('\n=== pagination REQUEST ===');
      console.log('  url    :', req.url());
      console.log('  method :', req.method());
      console.log('  body   :', req.postData());
      const h = req.headers();
      console.log('  x-requested-with:', h['x-requested-with']);
      console.log('  content-type    :', h['content-type']);
      console.log('  cookie present  :', !!h['cookie']);
    }
  });
  page.on('response', async (resp) => {
    if (resp.url().includes('fetch_data') && !captured) {
      captured = true;
      try {
        const body = await resp.text();
        writeFileSync(join(process.cwd(), 'businessdeals-page.html'), body);
        console.log('\n=== pagination RESPONSE ===');
        console.log('  status:', resp.status(), '| bytes:', body.length);
        console.log('  has Asking Price:', /Asking Price/.test(body), '| has Contact Seller:', /Contact Seller/.test(body));
      } catch (e) {
        console.log('  could not read response:', (e as Error).message);
      }
    }
  });

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  // Trigger pagination to page 2 (click a link/button whose href targets page=2).
  await page.locator('a[href*="page=2"], a:has-text("2")').first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(3500);

  await browser.close();
  console.log('\nDone. Say "done" and paste the REQUEST/RESPONSE lines above.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
