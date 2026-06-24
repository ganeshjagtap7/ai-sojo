/**
 * One-off: dump the *rendered* HTML of the StartuPage pages so we can write
 * accurate selectors. No data mapping — just saves what the browser sees.
 *
 * Run:  npx tsx scripts/inspect-startupage.ts
 *
 * Writes startupage-forsale.html and startupage-leaderboard.html to the project
 * root (git-ignored). Also prints quick diagnostics.
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const AUTH_FILE = join(process.cwd(), 'startupage-auth.json');
const PAGES = [
  { name: 'forsale', url: 'https://startupa.ge/opportunities?category=for-sale' },
  { name: 'leaderboard', url: 'https://startupa.ge/leaderboard?tab=startups&sort=revenue' },
  // A single startup profile — to find where the founder name lives.
  { name: 'profile', url: 'https://startupa.ge/startups/suraxon' },
];

async function main() {
  if (!existsSync(AUTH_FILE)) {
    console.error('No session found. Run: npx tsx scripts/startupage-login.ts');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_FILE });

  for (const p of PAGES) {
    const page = await context.newPage();
    await page.goto(p.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const html = await page.content();
    const out = join(process.cwd(), `startupage-${p.name}.html`);
    writeFileSync(out, html);
    console.log(`\n[${p.name}] ${p.url}`);
    console.log(`  wrote ${html.length} bytes -> ${out}`);

    // Diagnostics via Playwright locators (run in Node, no page.evaluate needed).
    console.log(`  "View Details" matches : ${await page.locator('text=View Details').count()}`);
    console.log(`  "Startups for Sale"    : ${await page.locator('text=Startups for Sale').count()}`);
    console.log(`  <a href*="id="> links  : ${await page.locator('a[href*="id="]').count()}`);
    console.log(`  <table> elements       : ${await page.locator('table').count()}`);
    console.log(`  <tbody tr> rows        : ${await page.locator('tbody tr').count()}`);
    console.log(`  [role="row"] elements  : ${await page.locator('[role="row"]').count()}`);

    await page.close();
  }

  await browser.close();
  console.log('\nDone. Share the two .html files (or just say they exist) so I can fix the selectors.');
}

main().catch((err) => {
  console.error('Inspect failed:', err);
  process.exit(1);
});
