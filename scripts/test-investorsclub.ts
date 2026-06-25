/**
 * Local test for the Investors Club scraper. Writes investorsclub-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-investorsclub.ts
 *   (if 0 listings, bot-blocked headless — re-run: HEADED=1 npx tsx scripts/test-investorsclub.ts)
 *
 * Crawls the 4 list pages, then visits each detail page for gross revenue +
 * revenue multiple (~51 listings, takes ~1 minute).
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeInvestorsClub } from '../lib/scraping/investorsclub';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping investors.club/listings (list + detail pages)…');
  const leads = await scrapeInvestorsClub();

  if (leads.length === 0) {
    console.log('No listings — if bot-blocked headless, re-run: HEADED=1 npx tsx scripts/test-investorsclub.ts');
    return;
  }

  const rows = leads.map((l) => {
    const raw = (l.rawData ?? {}) as { badge?: string; monetization?: string };
    return {
      Name: l.businessName,
      Category: l.categories[0] ?? '',
      Industry: l.categories[1] ?? '',
      Status: raw.badge || '',
      'Asking Price': money(l.askingPrice),
      'Gross Revenue': money(l.annualRevenue),
      'Net Profit': money(l.annualProfit),
      'Revenue Multiple': l.revenueMultiple == null ? '' : `${l.revenueMultiple}x`,
      'Profit Multiple': l.profitMultiple == null ? '' : `${l.profitMultiple}x`,
      Established: l.foundedDate ?? '',
      Monetization: raw.monetization || '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 11 }, { wch: 18 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Investors Club');

  const outPath = join(process.cwd(), 'investorsclub-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
