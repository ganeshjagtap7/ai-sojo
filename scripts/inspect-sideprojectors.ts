/**
 * One-off: learn SideProjectors' structure — is it API-backed or server-rendered,
 * how does offset pagination work, and is REVENUE a capturable field (to exclude
 * pre-revenue)?
 *
 * Run:  npx tsx scripts/inspect-sideprojectors.ts
 *
 * Saves sideprojectors-list.html + sideprojectors-detail.html + any
 * sideprojectors-api-*.json (git-ignored).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL =
  'https://www.sideprojectors.com/home-search/all/ZmM4rtgJE8/sell,sold/SaaS,Shop,Blog,Website,Mobile,Desktop,Browser,Domain,Other/all/5000-10000/all/all/created_at/desc/20/0';
const DETAIL_URL = 'https://www.sideprojectors.com/project/81867/super-collection';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const captured: { url: string; len: number; body: string }[] = [];
  page.on('response', async (resp) => {
    try {
      if (!/json/i.test(resp.headers()['content-type'] || '')) return;
      const body = await resp.text();
      if (/project|for_sale|revenue|price|sell/i.test(body) && body.length > 200) {
        captured.push({ url: resp.url(), len: body.length, body });
      }
    } catch { /* ignore */ }
  });

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const listHtml = await page.content();
  writeFileSync(join(process.cwd(), 'sideprojectors-list.html'), listHtml);
  console.log(`\n[list] wrote ${listHtml.length} bytes`);
  console.log(`  "Found ... projects": ${(listHtml.match(/Found[^<]*projects/) || ['(n/a)'])[0]}`);
  console.log(`  /project/ links     : ${await page.locator('a[href*="/project/"]').count()}`);
  console.log(`  "FOR SALE" badges   : ${await page.locator('text=FOR SALE').count()}`);
  console.log(`  revenue-ish on page : ${/revenue|\/mo|pre-revenue/i.test(listHtml)}`);

  captured.sort((a, b) => b.len - a.len);
  console.log(`  JSON API responses  : ${captured.length}`);
  captured.slice(0, 4).forEach((c, i) => {
    writeFileSync(join(process.cwd(), `sideprojectors-api-${i + 1}.json`), c.body);
    console.log(`\n     #${i + 1} (${c.len}b) FULL URL:\n     ${c.url}`);
  });

  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const detailHtml = await page.content();
  writeFileSync(join(process.cwd(), 'sideprojectors-detail.html'), detailHtml);
  console.log(`\n[detail] wrote ${detailHtml.length} bytes`);
  for (const t of ['Revenue', 'Asking', 'Price', 'Profit', 'pre-revenue']) {
    console.log(`    "${t}": ${(detailHtml.match(new RegExp(t, 'gi')) || []).length}`);
  }

  await browser.close();
  console.log('\nDone. Say "done" and I will read the files.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
