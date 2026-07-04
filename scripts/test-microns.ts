/**
 * Local test for the Microns scraper. Writes microns-leads.xlsx.
 *
 * Prereq: npx tsx scripts/microns-login.ts   (data is gated; needs your token)
 * Run:    npx tsx scripts/test-microns.ts
 *
 * Pure API scrape (Xano) — no browser. NOTE: "Startup website" is not in the API
 * (gated/hidden), so it's not a column.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeMicrons } from '../lib/scraping/microns';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping Microns (Xano API)…');
  const leads = await scrapeMicrons();

  if (leads.length === 0) {
    console.log('No listings — token may be stale. Re-run: npx tsx scripts/microns-login.ts');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as { customers?: number | null; margin?: number | null; description?: string | null };
    return {
      Name: l.businessName,
      Category: l.categories[0] ?? '',
      'Asking Price': money(l.askingPrice),
      'TTM Revenue': money(l.annualRevenue),
      Customers: r.customers ?? '',
      Launched: l.foundedDate ?? '',
      'Revenue Multiple': l.revenueMultiple == null ? '' : `${l.revenueMultiple}x`,
      'Annual Profit': money(l.annualProfit),
      Margin: r.margin == null ? '' : `${r.margin}%`,
      'Short Description': r.description ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 60 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Microns');

  const outPath = join(process.cwd(), 'microns-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
