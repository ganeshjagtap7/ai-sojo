/**
 * Local test for the Synergy Business Brokers scraper. Writes synergy-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-synergy.ts
 *   (if 0 listings, re-run: HEADED=1 npx tsx scripts/test-synergy.ts)
 *
 * Scrolls the full list, then visits each detail page — takes a few minutes.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeSynergy } from '../lib/scraping/synergy';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping synergybb.com (list + detail pages)…');
  const leads = await scrapeSynergy();

  if (leads.length === 0) {
    console.log('No listings — if blocked headless, re-run: HEADED=1 npx tsx scripts/test-synergy.ts');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as {
      location?: string; industry?: string; description?: string; ebitda?: string; reasonForSale?: string;
      brokerName?: string; brokerPhone?: string; brokerEmail?: string; status?: string;
    };
    return {
      Name: l.businessName,
      Status: r.status ?? (l.forSale ? 'Available' : 'Has Accepted Offer'),
      Industry: r.industry ?? l.categories.join(', '),
      Location: r.location ?? '',
      'Asking Price': money(l.askingPrice),
      'Annual Revenue': money(l.annualRevenue),
      'Net Cash Flow': money(l.annualProfit),
      EBITDA: r.ebitda ?? '',
      Employees: l.employeeCount ?? '',
      'Reason for Sale': r.reasonForSale ?? '',
      'Short Description': r.description ?? '',
      'Broker Name': r.brokerName ?? '',
      'Broker Phone': r.brokerPhone ?? '',
      'Broker Email': r.brokerEmail ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 40 }, { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 14 },
    { wch: 10 }, { wch: 18 }, { wch: 55 }, { wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Synergy Business Brokers');

  const outPath = join(process.cwd(), 'synergy-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
