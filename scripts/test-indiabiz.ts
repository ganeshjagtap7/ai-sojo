/**
 * Local test for the IndiaBizForSale scraper. Writes indiabiz-leads.xlsx.
 *
 * Run:  IB_LIMIT=500 npx tsx scripts/test-indiabiz.ts   (cap ~500, recommended)
 *       npx tsx scripts/test-indiabiz.ts                 (ALL ~16k — very long)
 *
 * For Sale; rich detail fields per listing; contact is masked (not captured).
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeIndiaBiz } from '../lib/scraping/indiabiz';

const inr = (n: number | null | undefined) => (n == null ? '' : `₹${n.toLocaleString('en-IN')}`);

async function main() {
  console.log('Scraping indiabizforsale.com (list API + detail pages)…');
  const leads = await scrapeIndiaBiz();

  if (leads.length === 0) {
    console.log('No listings — the /search/now API may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Industry: l.categories[0] ?? '',
      'Sub-Category': (r.subcategory as string) ?? '',
      City: l.city ?? '',
      State: l.state ?? '',
      'Asking Price': inr(l.askingPrice) || (r.askingRange ? `₹${r.askingRange} (range)` : ''),
      'Asking Range': (r.askingRange as string) ?? '',
      Turnover: (r.turnover as string) ?? '',
      'Entity Type': (r.entityType as string) ?? '',
      'Started In': (r.startedIn as string) ?? '',
      Employees: (r.employees as string) ?? '',
      'Operational Status': (r.operationalStatus as string) ?? '',
      'Sale Type': (r.saleType as string) ?? '',
      'Min Ticket': (r.minTicket as string) ?? '',
      'GST Verified': r.gstVerified ? 'Yes' : '',
      Description: (r.description as string) ?? '',
      Reason: (r.reason as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 40 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 11 },
    { wch: 50 }, { wch: 40 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'IndiaBizForSale');

  const outPath = join(process.cwd(), 'indiabiz-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
