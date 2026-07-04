/**
 * One-off: check whether IndiaBizForSale loads listings from a backend API
 * (and how rich it is — asking price, turnover, EBITDA?). Captures JSON network
 * responses on the list page + clicks "Show more" to trigger pagination.
 *
 * Run:  npx tsx scripts/inspect-indiabiz.ts
 *
 * Saves indiabiz-api-*.json + indiabiz-list.html + indiabiz-detail.html (ignored).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://www.indiabizforsale.com/business/business-opportunities-for-sale';
const DETAIL_URL =
  'https://www.indiabizforsale.com/business/buy/biodiesel-mfg-plant-asset-sale-funds-raise-in-indore-sl031445';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('request', (req) => {
    if (req.url().includes('/search/now')) {
      console.log('\n=== /search/now REQUEST ===');
      console.log('  method:', req.method());
      console.log('  url   :', req.url());
      console.log('  body  :', req.postData());
      console.log('  x-requested-with:', req.headers()['x-requested-with'], '| content-type:', req.headers()['content-type']);
    }
  });

  const captured: { url: string; len: number; body: string }[] = [];
  page.on('response', async (resp) => {
    try {
      if (!/json/i.test(resp.headers()['content-type'] || '')) return;
      const body = await resp.text();
      if (/asking|turnover|ebitda|listing|business|price/i.test(body) && body.length > 200) {
        captured.push({ url: resp.url(), len: body.length, body });
      }
    } catch { /* ignore */ }
  });

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('text=Show more').first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(3000);

  writeFileSync(join(process.cwd(), 'indiabiz-list.html'), await page.content());
  captured.sort((a, b) => b.len - a.len);
  const top = captured.slice(0, 6);
  console.log(`\nCaptured ${captured.length} JSON responses. Top ${top.length}:`);
  top.forEach((c, i) => {
    writeFileSync(join(process.cwd(), `indiabiz-api-${i + 1}.json`), c.body);
    console.log(`  #${i + 1}  ${c.len}b  ${c.url.slice(0, 130)}`);
  });
  if (top.length === 0) console.log('  (no JSON API — listings are server-rendered HTML.)');

  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  writeFileSync(join(process.cwd(), 'indiabiz-detail.html'), await page.content());
  console.log('\n[detail] saved indiabiz-detail.html');

  await browser.close();
  console.log('\nDone. Say "done" and paste the captured API lines.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
