/**
 * Local test for the StartuPage scraper. Writes results to startupage-leads.xlsx.
 *
 * Run:  npx tsx --env-file=.env.local scripts/test-startupage.ts
 *
 * Prereq: log in once via  npx tsx scripts/startupage-login.ts
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeStartuPage } from '../lib/scraping/startupage';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping startupa.ge (for-sale + leaderboard)…');
  const leads = await scrapeStartuPage();

  if (leads.length === 0) {
    console.log('No listings returned. If you are not logged in, run: npx tsx scripts/startupage-login.ts');
    return;
  }

  const rows = leads.map((l) => ({
    'Business Name': l.businessName,
    Founder: l.founderName ?? '',
    'For Sale?': l.forSale ? 'Yes' : 'Not listed · can enquire',
    MRR: money(l.mrr),
    'Asking Price': money(l.askingPrice),
    Multiple: l.revenueMultiple == null ? '' : `${l.revenueMultiple}x`,
    'Annual Revenue': money(l.annualRevenue),
    Founded: l.foundedDate ?? '',
    Category: l.categories.join(', '),
    'Listing URL': l.sourceUrl ?? '',
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 12 },
    { wch: 14 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'StartuPage Leads');

  const outPath = join(process.cwd(), 'startupage-leads.xlsx');
  XLSX.writeFile(wb, outPath);

  const forSale = leads.filter((l) => l.forSale).length;
  console.log(`\n✓ Wrote ${leads.length} listings (${forSale} for sale) to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
