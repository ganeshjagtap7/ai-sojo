/**
 * Local test for the AppPeak scraper. Writes results to apppeak-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-apppeak.ts
 *
 * AppPeak is public — no login needed.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeAppPeak } from '../lib/scraping/apppeak';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping listings.apppeak.com/listings…');
  const leads = await scrapeAppPeak();

  if (leads.length === 0) {
    console.log('No listings returned — the page structure may have changed. Re-run scripts/inspect-apppeak.ts.');
    return;
  }

  const rows = leads.map((l) => {
    const raw = (l.rawData ?? {}) as { downloads?: string; hotDeal?: boolean; sold?: boolean };
    const status = raw.sold ? 'Sold' : l.askingPrice ? 'For sale' : 'Offer-only';
    return {
      'App Name': l.businessName,
      Status: status,
      Category: l.categories.join(', '),
      'Asking Price': money(l.askingPrice),
      'Annual Revenue': money(l.annualRevenue),
      'Annual Profit': money(l.annualProfit),
      'Rev Multiple': l.revenueMultiple == null ? '' : `${l.revenueMultiple}x`,
      'Profit Multiple': l.profitMultiple == null ? '' : `${l.profitMultiple}x`,
      Rating: l.googleRating ?? '',
      'Age (yrs)': l.yearsInBusiness ?? '',
      Downloads: raw.downloads ?? '',
      'Hot Deal': raw.hotDeal ? 'Yes' : '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 32 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 13 }, { wch: 14 }, { wch: 8 }, { wch: 9 }, { wch: 12 }, { wch: 9 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'AppPeak Listings');

  const outPath = join(process.cwd(), 'apppeak-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
