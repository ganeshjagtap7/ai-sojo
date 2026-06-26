/**
 * One-off: capture Microns' Xano API responses (list + detail) so we can scrape
 * the API directly.
 *
 * Prereq: npx tsx scripts/microns-login.ts
 * Run:    npx tsx scripts/inspect-microns.ts
 *
 * Saves microns-api-list.json + microns-api-detail.json (git-ignored).
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://app.microns.io/buyer/listings';
const DETAIL_URL = 'https://app.microns.io/buyer/listing?listing_id=4981853152848302';
const AUTH_FILE = join(process.cwd(), 'microns-auth.json');

async function main() {
  if (!existsSync(AUTH_FILE)) {
    console.error('No session. Run: npx tsx scripts/microns-login.ts');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  const xano: { url: string; len: number; body: string }[] = [];
  page.on('response', async (resp) => {
    try {
      if (!/xano\.io/i.test(resp.url())) return;
      if (!/json/i.test(resp.headers()['content-type'] || '')) return;
      xano.push({ url: resp.url(), len: (await resp.text()).length, body: await resp.text() });
    } catch {
      /* ignore */
    }
  });

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  console.log(`\nCaptured ${xano.length} Xano JSON responses:`);
  // Pick the listing-LIST response (has "itemsTotal") and the DETAIL response
  // (single listing, has asking_price but not itemsTotal).
  const listResp = xano.find((r) => /itemsTotal/.test(r.body));
  const detailResp = xano
    .filter((r) => /asking_price/.test(r.body) && !/itemsTotal/.test(r.body))
    .sort((a, b) => b.len - a.len)[0];

  if (listResp) {
    writeFileSync(join(process.cwd(), 'microns-api-list.json'), listResp.body);
    console.log(`  [list]   ${listResp.len} bytes  ${listResp.url}`);
  }
  if (detailResp) {
    writeFileSync(join(process.cwd(), 'microns-api-detail.json'), detailResp.body);
    console.log(`  [detail] ${detailResp.len} bytes  ${detailResp.url}`);
  }
  xano.forEach((r) => console.log(`   · ${r.len} bytes  ${r.url.slice(0, 110)}`));

  await browser.close();
  console.log('\nDone. Say "done" and I will read both JSON files.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
