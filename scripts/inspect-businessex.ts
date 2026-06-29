/**
 * Recon for businessex.com (Businesses For Sale). JS-rendered; detail is login-
 * gated. Reuses businessex-auth.json (run businessex-login.ts first). Loads a list
 * page + a detail page and reports: JSON API vs rendered HTML, pagination, the
 * card -> detail link shape, and which detail fields are visible vs gated.
 *
 * Run:  npx tsx scripts/inspect-businessex.ts
 * Saves businessex-*.html + businessex-api-*.json (gitignored). Paste the output.
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const LIST = 'https://businessex.com/businesslisting/sale';
const DETAIL = 'https://businessex.com/business/seeking-buyers-for-marketing-and-communication-agency/mdk69z';
const AUTH = join(process.cwd(), 'businessex-auth.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1400, height: 900 },
    ...(existsSync(AUTH) ? { storageState: AUTH } : {}),
  });
  console.log(existsSync(AUTH) ? '(using saved session businessex-auth.json)' : '(NO auth — detail may be gated)');
  const page = await context.newPage();

  const captured: { url: string; len: number; body: string }[] = [];
  page.on('request', (req) => {
    const t = req.resourceType();
    if ((t === 'xhr' || t === 'fetch') && !/\.(png|jpg|jpeg|webp|svg|css|woff|gif)/i.test(req.url())) {
      console.log(`  [req] ${req.method()} ${req.url().slice(0, 170)}`);
      const b = req.postData();
      if (b) console.log('        body:', b.slice(0, 200));
    }
  });
  page.on('response', async (resp) => {
    try {
      if (!/json/i.test(resp.headers()['content-type'] || '')) return;
      const body = await resp.text();
      if (body.length > 150 && /business|listing|asking|annual|price|ebitda|establishment|sale/i.test(body)) {
        captured.push({ url: resp.url(), len: body.length, body });
      }
    } catch { /* ignore */ }
  });

  console.log('\n========== LIST PAGE ==========');
  await page.goto(LIST, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  writeFileSync(join(process.cwd(), 'businessex-list.html'), await page.content());
  const detailLinks = await page.$$eval('a[href]', (els) =>
    Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).href).filter((h) => /\/business\/[a-z0-9-]+\/[a-z0-9]+$/i.test(h)))).slice(0, 6),
  );
  console.log('  rendered detail links:'); detailLinks.forEach((u) => console.log('    -', u));
  const pager = await page.$$eval('a[href], button', (els) =>
    Array.from(new Set(els.map((e) => (e.getAttribute('href') || e.textContent || '').trim()).filter((t) => /page|^\d{1,3}$|next/i.test(t)))).slice(0, 14),
  );
  console.log('  pagination-ish:', pager);

  console.log('\n========== DETAIL PAGE ==========');
  await page.goto(DETAIL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  writeFileSync(join(process.cwd(), 'businessex-detail.html'), await page.content());
  const detailText = await page.evaluate(() => document.body.innerText);
  console.log('  detail visible fields:',
    ['Asking Price', 'Annual Sales', 'EBITDA', 'Gross Income', 'Establishment Year', 'Business Sector', 'One-line Business', 'Available after']
      .filter((k) => detailText.includes(k)).join(', '));

  captured.sort((a, b) => b.len - a.len);
  const top = captured.slice(0, 8);
  console.log(`\nCaptured ${captured.length} JSON responses. Top ${top.length}:`);
  top.forEach((c, i) => {
    writeFileSync(join(process.cwd(), `businessex-api-${i + 1}.json`), c.body);
    console.log(`  #${i + 1}  ${c.len}b  ${c.url.slice(0, 150)}`);
  });
  if (top.length === 0) console.log('  (no JSON API captured — pages may be server-rendered into HTML.)');

  await browser.close();
  console.log('\nDone. Paste [req] lines, detail links, pagination, visible fields, and #1..#N API URLs.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
