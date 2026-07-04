/**
 * Local test for the BusinessEx (businessex.com) scraper. Writes businessex-leads.xlsx.
 *
 * Run:  BEX_LIMIT=500 npx tsx scripts/test-businessex.ts   (cap ~500, quick)
 *       npx tsx scripts/test-businessex.ts                  (ALL ~1346)
 *
 * SALE listings only (no investor/loan). Pure API — no browser, no login. Owner
 * contact is gated (returns empty) so it isn't captured. Asking Price shown as
 * the site's label (e.g. "1 Crores"); other money fields in rupees.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeBusinessEx } from '../lib/scraping/businessex';

const inr = (n: number | null | undefined) => (n == null ? '' : `₹${n.toLocaleString('en-IN')}`);

async function main() {
  console.log('Scraping businessex.com — businesses for sale…');
  const leads = await scrapeBusinessEx();
  if (leads.length === 0) {
    console.log('No listings — the bxapi may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Industry: (r.industry as string) ?? '',
      'Sub-Category': (r.subIndustry as string) ?? '',
      'Asking Price': (r.askingPriceLabel as string) ?? inr(l.askingPrice),
      'Annual Sale': inr(r.annualSale as number),
      EBITDA: inr(r.ebitda as number),
      'EBITDA Margin': r.ebitdaMargin != null ? `${r.ebitdaMargin}%` : '',
      'Gross Income': inr(r.grossIncome as number),
      'Estd Year': (r.establishmentYear as number) ?? '',
      Employees: (r.employees as string) ?? '',
      'Entity Type': (r.entityType as string) ?? '',
      'Business Type': (r.businessType as string) ?? '',
      City: l.city ?? '',
      State: l.state ?? '',
      Country: (r.country as string) ?? '',
      'Reason for Sale': (r.reasonForSale as string) ?? '',
      'Listed By': (r.listedBy as string) ?? '',
      'Business Pitch': (r.businessPitch as string) ?? '',
      Facilities: (r.facilities as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 44 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 },
    { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 36 }, { wch: 12 }, { wch: 50 }, { wch: 40 }, { wch: 60 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'BusinessEx');
  const outPath = join(process.cwd(), 'businessex-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} for-sale listings to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
