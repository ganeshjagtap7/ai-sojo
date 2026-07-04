/**
 * Recon for mergerdomo.com. Reuses mergerdomo-auth.json (run mergerdomo-login.ts
 * first) so it can see gated detail pages. Loads the two marketplace list pages
 * (business-for-sale + buyers-for-business) and one detail page from each, and
 * reports: whether data comes from a JSON API or server-rendered HTML, how
 * pagination works, the card → detail link shape, and the detail-page fields.
 *
 * Run:  npx tsx scripts/inspect-mergerdomo.ts
 * Saves mergerdomo-*.html + mergerdomo-api-*.json (gitignored). Paste the output.
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const SALE = 'https://mergerdomo.com/marketplace/business-for-sale';
const BUYERS = 'https://mergerdomo.com/marketplace/buyers-for-business';
const AUTH = join(process.cwd(), 'mergerdomo-auth.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1400, height: 900 },
    ...(existsSync(AUTH) ? { storageState: AUTH } : {}),
  });
  console.log(existsSync(AUTH) ? '(using saved session mergerdomo-auth.json)' : '(NO auth file — detail pages may be gated)');
  const page = await context.newPage();

  const captured: { url: string; len: number; body: string }[] = [];
  page.on('request', (req) => {
    const t = req.resourceType();
    if ((t === 'xhr' || t === 'fetch') && !/\.(png|jpg|jpeg|webp|svg|css|woff|gif)/i.test(req.url())) {
      console.log(`  [req] ${req.method()} ${req.url().slice(0, 160)}`);
      const b = req.postData();
      if (b) console.log('        body:', b.slice(0, 200));
    }
  });
  page.on('response', async (resp) => {
    try {
      if (!/json/i.test(resp.headers()['content-type'] || '')) return;
      const body = await resp.text();
      if (body.length > 150 && /deal|business|buyer|asking|revenue|budget|industry|marketplace|brief/i.test(body)) {
        captured.push({ url: resp.url(), len: body.length, body });
      }
    } catch { /* ignore */ }
  });

  const links = async (label: string) => {
    const a = await page.$$eval('a[href]', (els) =>
      els.map((e) => (e as HTMLAnchorElement).href).filter((h) => /\/(buy-business|sell-business|business|buyer|deal)/i.test(h)),
    );
    const uniq = Array.from(new Set(a)).slice(0, 6);
    console.log(`  ${label} candidate detail links:`); uniq.forEach((u) => console.log('    -', u));
    return uniq;
  };

  console.log('\n========== SALE LIST ==========');
  await page.goto(SALE, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  writeFileSync(join(process.cwd(), 'mergerdomo-sale-list.html'), await page.content());
  const saleLinks = await links('SALE');

  console.log('\n========== BUYERS LIST ==========');
  await page.goto(BUYERS, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  writeFileSync(join(process.cwd(), 'mergerdomo-buyers-list.html'), await page.content());
  const buyerLinks = await links('BUYERS');

  if (saleLinks[0]) {
    console.log('\n========== SALE DETAIL ==========', saleLinks[0]);
    await page.goto(saleLinks[0], { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    writeFileSync(join(process.cwd(), 'mergerdomo-sale-detail.html'), await page.content());
  }
  if (buyerLinks[0]) {
    console.log('\n========== BUYER DETAIL ==========', buyerLinks[0]);
    await page.goto(buyerLinks[0], { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    writeFileSync(join(process.cwd(), 'mergerdomo-buyer-detail.html'), await page.content());
  }

  captured.sort((a, b) => b.len - a.len);
  const top = captured.slice(0, 8);
  console.log(`\n\nCaptured ${captured.length} JSON responses. Top ${top.length}:`);
  top.forEach((c, i) => {
    writeFileSync(join(process.cwd(), `mergerdomo-api-${i + 1}.json`), c.body);
    console.log(`  #${i + 1}  ${c.len}b  ${c.url.slice(0, 150)}`);
  });
  if (top.length === 0) console.log('  (no JSON API — pages are server-rendered HTML; we will parse the DOM.)');

  await browser.close();
  console.log('\nDone. Paste the [req] lines, candidate links, and the #1..#N API URLs.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
