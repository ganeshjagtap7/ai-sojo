/**
 * One-off recon for buybiz.co.in (BuyBizApp) — a JS-rendered SPA, so listings +
 * detail fields come from a backend JSON API. This loads a category list page and
 * one detail page in a real browser, captures every JSON response (and the request
 * shape), so we can find the endpoint(s) that return listings + rich fields.
 *
 * Run:  npx tsx scripts/inspect-buybiz.ts
 *
 * Saves buybiz-api-*.json + buybiz-list.html + buybiz-detail.html (all gitignored).
 * Then say "done" and paste the printed API lines.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://buybiz.co.in/category/small-business';
const DETAIL_URL = 'https://buybiz.co.in/product-details/martial-arts-school';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Log every non-document request that looks like an API call (xhr/fetch).
  page.on('request', (req) => {
    const t = req.resourceType();
    if ((t === 'xhr' || t === 'fetch') && !/\.(png|jpg|jpeg|webp|svg|css|woff)/i.test(req.url())) {
      console.log(`\n[req] ${req.method()} ${req.url()}`);
      const body = req.postData();
      if (body) console.log('      body:', body.slice(0, 300));
    }
  });

  const captured: { url: string; len: number; body: string }[] = [];
  const grab = async (resp: import('playwright').Response) => {
    try {
      const ct = resp.headers()['content-type'] || '';
      if (!/json/i.test(ct)) return;
      const body = await resp.text();
      if (body.length > 100 && /price|title|business|location|turnover|category|product|listing|small/i.test(body)) {
        captured.push({ url: resp.url(), len: body.length, body });
      }
    } catch { /* ignore */ }
  };
  page.on('response', grab);

  console.log('\n========== LIST PAGE ==========');
  await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  writeFileSync(join(process.cwd(), 'buybiz-list.html'), await page.content());

  console.log('\n========== DETAIL PAGE ==========');
  await page.goto(DETAIL_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  writeFileSync(join(process.cwd(), 'buybiz-detail.html'), await page.content());

  captured.sort((a, b) => b.len - a.len);
  const top = captured.slice(0, 8);
  console.log(`\n\nCaptured ${captured.length} JSON responses. Top ${top.length}:`);
  top.forEach((c, i) => {
    writeFileSync(join(process.cwd(), `buybiz-api-${i + 1}.json`), c.body);
    console.log(`  #${i + 1}  ${c.len}b  ${c.url.slice(0, 150)}`);
  });
  if (top.length === 0) console.log('  (no JSON API captured — may be server-rendered or use a different transport.)');

  await browser.close();
  console.log('\nDone. Say "done" and paste the [req] lines + the API URLs above.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
