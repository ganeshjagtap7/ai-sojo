/**
 * Local test for the ESA (Electrical Safety Authority, Ontario) contractor scraper.
 * Writes esa-leads.xlsx. Plain fetch — no browser, no cookie.
 *
 * Run:  npx tsx scripts/test-esa.ts                       (Valid licences only, ~10,308)
 *       ESA_STATUS=all npx tsx scripts/test-esa.ts        (every status, ~18,392)
 *       ESA_STATUS=Valid,Suspended npx tsx scripts/test-esa.ts
 *       ESA_LIMIT=200 npx tsx scripts/test-esa.ts         (quick capped check)
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeEsaContractors } from '../lib/scraping/esaContractors';

async function main() {
  console.log('Scraping licensing.esasafe.com (ESA contractor locator)…');
  const leads = await scrapeEsaContractors();
  if (leads.length === 0) {
    console.log('No results — the data endpoint or status filter may need a look.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      'Licence #': (r.licenceNumber as string) ?? '',
      'Work Types': (r.worktypes as string) ?? '',
      Phone: l.phone ?? '',
      Cellphone: (r.cellphone as string) ?? '',
      Website: l.website ?? '',
      Address: l.address ?? '',
      City: l.city ?? '',
      Province: l.state ?? '',
      'Profile URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 }, { wch: 11 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 28 },
    { wch: 30 }, { wch: 18 }, { wch: 9 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'ESA Contractors');
  const outPath = join(process.cwd(), 'esa-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} contractors to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
