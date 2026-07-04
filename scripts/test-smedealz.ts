/**
 * Local test for the smeDealz (smedealz.com) scraper. Writes smedealz-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-smedealz.ts
 *
 * Pure API (no browser). Small platform (~32 seller listings). Owner contact is
 * masked on the page, so it's not captured. Estimate price shown in real rupees
 * (the site stores it in lakhs); financials are raw rupees from the API.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeSmeDealz } from '../lib/scraping/smedealz';

// price is stored in LAKHS — show it exactly like the site: "₹ 10000000.00"
// (raw value, 2 decimals, no thousands grouping). Header carries "(lakhs)".
const lakh = (n: number | null | undefined) => (n == null ? '' : `₹ ${n.toFixed(2)}`);

async function main() {
  console.log('Scraping smedealz.com (getListings + viewproperty APIs)…');
  const leads = await scrapeSmeDealz();
  if (leads.length === 0) {
    console.log('No listings — the API may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      'Company Name': (r.companyName as string) ?? '',
      'Firm Type': (r.firmType as string) ?? '',
      'Working Status': (r.workingStatus as string) ?? '',
      'Sale Type': (r.saleType as string) ?? '',
      'Estimate Price (lakhs)': lakh(r.estimateLakh as number),
      Industry: (r.industry as string) ?? '',
      'Sub-Category': (r.subCategory as string) ?? '',
      'Sales (lakhs)': (r.salesByYear as string) ?? '',
      'EBIDTA (lakhs)': (r.ebidtaByYear as string) ?? '',
      'PAT (lakhs)': (r.patByYear as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 44 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 18 },
    { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 70 }, { wch: 48 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'smeDealz');
  const outPath = join(process.cwd(), 'smedealz-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
