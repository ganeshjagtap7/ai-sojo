/**
 * One-off: check whether ExitBid loads auctions from a backend API. Captures
 * JSON network responses on the auctions page + one auction detail.
 *
 * Run:  npx tsx scripts/inspect-exitbid.ts
 *
 * Saves promising JSON to exitbid-api-1.json … (git-ignored).
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://exitbid.io/#auctions';
const DETAIL_URL = 'https://exitbid.io/auction?id=d83837c9-8314-4a64-9980-e7cdad5ffe61';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const captured: { url: string; len: number; body: string }[] = [];
  page.on('response', async (resp) => {
    try {
      if (!/json/i.test(resp.headers()['content-type'] || '')) return;
      const body = await resp.text();
      if (/bid|auction|revenue|reserve|mrr|listing/i.test(body) && body.length > 150) {
        captured.push({ url: resp.url(), len: body.length, body });
      }
    } catch { /* ignore */ }
  });

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  captured.sort((a, b) => b.len - a.len);
  const top = captured.slice(0, 6);
  console.log(`\nCaptured ${captured.length} JSON responses. Top ${top.length}:`);
  top.forEach((c, i) => {
    writeFileSync(join(process.cwd(), `exitbid-api-${i + 1}.json`), c.body);
    console.log(`  #${i + 1}  ${c.len} bytes  ${c.url.slice(0, 130)}`);
  });
  if (top.length === 0) console.log('  (no JSON API — auctions are server/DOM-rendered; we will scrape the DOM.)');

  await browser.close();
  console.log('\nDone. Say "done" and I will read what came back.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
