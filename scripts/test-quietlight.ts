/**
 * Local test for the Quiet Light scraper. Writes results to quietlight-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-quietlight.ts
 *
 * Quiet Light is public but Cloudflare-protected, so a browser window opens to
 * clear the bot check — let it run, don't close it.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeQuietLight } from '../lib/scraping/quietlight';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping quietlight.com/listings (a browser window will open)…');
  const leads = await scrapeQuietLight();

  if (leads.length === 0) {
    console.log('No listings returned — Cloudflare may not have cleared. Re-run scripts/inspect-quietlight.ts.');
    return;
  }

  const rows = leads.map((l) => {
    const raw = (l.rawData ?? {}) as { status?: string; price?: string };
    return {
      Title: l.businessName,
      Status: raw.status ?? (l.forSale ? 'Available' : 'Recently Sold'),
      Category: l.categories.join(', '),
      'Asking Price': l.askingPrice == null ? (raw.price || '') : money(l.askingPrice),
      Revenue: money(l.annualRevenue),
      'Income (SDE)': money(l.annualProfit),
      Multiple: l.revenueMultiple == null ? '' : `${l.revenueMultiple}x`,
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 42 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Quiet Light Listings');

  const outPath = join(process.cwd(), 'quietlight-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
