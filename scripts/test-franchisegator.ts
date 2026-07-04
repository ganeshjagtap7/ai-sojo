/**
 * Local test for the FranchiseGator (franchisegator.com) scraper. Writes
 * franchisegator-leads.xlsx.
 *
 * Run:  FG_LIMIT=300 npx tsx scripts/test-franchisegator.ts   (cap ~300)
 *       npx tsx scripts/test-franchisegator.ts                 (ALL ~3869 — a few min)
 *
 * Franchise opportunities (national, all locations). Pure API — no browser.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeFranchiseGator } from '../lib/scraping/franchisegator';

async function main() {
  console.log('Scraping franchisegator.com (sitemap + detail pages)…');
  const leads = await scrapeFranchiseGator();
  if (leads.length === 0) {
    console.log('No franchises — the sitemap or page format may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Industry: (r.industry as string) ?? '',
      'Liquid Capital': (r.liquidCapital as string) ?? '',
      'Net Worth': (r.netWorth as string) ?? '',
      'Franchise Fee': (r.franchiseFee as string) ?? '',
      'Total Investment': (r.totalInvestment as string) ?? '',
      Financing: (r.financing as string) ?? '',
      Training: (r.training as string) ?? '',
      'Veteran Discount': (r.veteranDiscount as string) ?? '',
      'SBA Approved': (r.sbaApproved as string) ?? '',
      'Total Units': (r.totalUnits as string) ?? '',
      'Home Office': (r.homeOffice as string) ?? '',
      'Year Founded': (r.yearFounded as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 12 },
    { wch: 28 }, { wch: 12 }, { wch: 11 }, { wch: 18 }, { wch: 12 }, { wch: 70 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'FranchiseGator');
  const outPath = join(process.cwd(), 'franchisegator-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} franchises to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
