/**
 * Local test for the Website Closers scraper. Writes websiteclosers-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-websiteclosers.ts
 *   (if it returns 0 listings, the site bot-blocked headless — re-run headed:)
 *        HEADED=1 npx tsx scripts/test-websiteclosers.ts
 *
 * Crawls all list pages, then visits each detail page for revenue + year, so it
 * takes a few minutes.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeWebsiteClosers } from '../lib/scraping/websiteclosers';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping websiteclosers.com (list pages + detail pages)…');
  const leads = await scrapeWebsiteClosers();

  if (leads.length === 0) {
    console.log('No listings — if it bot-blocked headless, re-run: HEADED=1 npx tsx scripts/test-websiteclosers.ts');
    return;
  }

  const rows = leads.map((l) => {
    const raw = (l.rawData ?? {}) as { status?: string };
    // Name = headline before the first separator; Title = the rest (highlights),
    // so the name isn't repeated. Titles use either "|" OR a spaced en/em-dash as
    // the separator — split on whichever comes first, but NOT plain hyphens
    // (e.g. "16-Year", "SBA Pre-Qualified" must stay intact).
    const full = l.businessName;
    const sep = full.match(/\s*\|\s*|\s+[–—]\s+/);
    let name = full.trim();
    let highlights = '';
    if (sep && sep.index !== undefined) {
      name = full.slice(0, sep.index).trim();
      highlights = full.slice(sep.index + sep[0].length).trim();
    }
    return {
      Name: name,
      Title: highlights,
      Status: raw.status || (l.forSale ? 'Available' : 'Sold'),
      'Asking Price': money(l.askingPrice),
      'Cash Flow': money(l.annualProfit),
      'Gross Income': money(l.annualRevenue),
      'Year Established': l.foundedDate ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 44 }, { wch: 50 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 42 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Website Closers');

  const outPath = join(process.cwd(), 'websiteclosers-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
