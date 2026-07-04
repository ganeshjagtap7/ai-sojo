/**
 * One-off: dump the Motion Invest marketplace + a few detail pages (authed) so we
 * can write accurate selectors — including the Website-only Backlinks/SEO section.
 *
 * Prereq: npx tsx scripts/motioninvest-login.ts
 * Run:    npx tsx scripts/inspect-motioninvest.ts
 *
 * Writes motioninvest-list.html + motioninvest-detail-1/2/3.html (git-ignored).
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const LIST_URL = 'https://motioninvest.com/marketplace';
const AUTH_FILE = join(process.cwd(), 'motioninvest-auth.json');

async function main() {
  if (!existsSync(AUTH_FILE)) {
    console.error('No session. Run: npx tsx scripts/motioninvest-login.ts');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('text=Asking Price', { timeout: 40000 }).catch(() => {});
  // Scroll to load all 104 (lazy-load).
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
  }
  const listHtml = await page.content();
  writeFileSync(join(process.cwd(), 'motioninvest-list.html'), listHtml);
  console.log(`\n[list] wrote ${listHtml.length} bytes`);
  console.log(`  "Asking Price" : ${await page.locator('text=Asking Price').count()}`);
  console.log(`  "View Details" : ${await page.locator('text=View Details').count()}`);

  // Collect detail links from "View Details" anchors (try to grab one Website + one YouTube).
  const links: { href: string; type: string }[] = await page.evaluate(() => {
    const out: { href: string; type: string }[] = [];
    document.querySelectorAll('a').forEach((a) => {
      if (!/view details/i.test(a.textContent || '')) return;
      const card = a.closest('div');
      const type = /youtube/i.test(card?.textContent || '') ? 'youtube' : 'website';
      if (a.href) out.push({ href: a.href, type });
    });
    return out;
  });
  const website = links.find((l) => l.type === 'website');
  const youtube = links.find((l) => l.type === 'youtube');
  const picks = [website, youtube, links[0]].filter(Boolean).filter((v, i, arr) => arr.findIndex((x) => x!.href === v!.href) === i).slice(0, 3);
  console.log(`  detail links found: ${links.length}; sampling ${picks.length}`);

  let n = 0;
  for (const pick of picks) {
    n++;
    await page.goto(pick!.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('text=Income Multiple', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const html = await page.content();
    writeFileSync(join(process.cwd(), `motioninvest-detail-${n}.html`), html);
    console.log(`\n[detail-${n}] ${pick!.type} — ${pick!.href}`);
    for (const t of ['Income Multiple', 'Established', 'Niche', 'Total Income', 'Last 12 Month', 'Overview', 'Backlink', 'SEO']) {
      console.log(`    "${t}": ${await page.locator(`text=${t}`).count()}`);
    }
  }

  await browser.close();
  console.log('\nDone. Say "done" and I will read the files.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
