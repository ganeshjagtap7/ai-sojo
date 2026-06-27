/**
 * Recon v3 for tobuz.com — confirm pagination. Cards inject into #partialContainer
 * as onclick="contact_business2(id,'slug',...)" (no /L- anchors). This loads page 1,
 * extracts the id+slug pairs, then tries several page-2 URL candidates and reports
 * which one returns a DIFFERENT set of listings (= the real pagination URL).
 *
 * Run:  npx tsx scripts/inspect-tobuz.ts
 */
import { chromium } from 'playwright';
import { join } from 'path';
import { writeFileSync } from 'fs';

const BASE = 'https://tobuz.com/business/business-for-sale-investment-opportunities';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const cardIds = async (): Promise<string[]> => {
    await page
      .waitForFunction(() => /contact_business2\(\d+/.test(document.body.innerHTML), { timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    return page.evaluate(() => {
      const ids = new Set<string>();
      const re = /contact_business2\((\d+),'([^']*)'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(document.body.innerHTML))) ids.add(`${m[1]}|${m[2]}`);
      return Array.from(ids);
    });
  };

  console.log('Page 1:', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const p1 = await cardIds();
  console.log(`  page1 cards: ${p1.length}`);
  p1.slice(0, 3).forEach((x) => console.log('    -', x));
  writeFileSync(join(process.cwd(), 'tobuz-list-rendered.html'), await page.content());

  const candidates = [
    `${BASE}-all/2?layout=grid`,
    `${BASE}/2?layout=grid`,
    `${BASE}-all/2`,
    `${BASE}/pagenum=2`,
  ];
  const p1set = new Set(p1);
  for (const url of candidates) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const p2 = await cardIds();
    const fresh = p2.filter((x) => !p1set.has(x)).length;
    console.log(`\n${url}\n  cards: ${p2.length}, NEW vs page1: ${fresh}  ${fresh > 0 ? '<<< PAGINATION WORKS' : ''}`);
    p2.slice(0, 2).forEach((x) => console.log('    -', x));
  }

  await browser.close();
  console.log('\nDone. Tell me which candidate showed "PAGINATION WORKS".');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
