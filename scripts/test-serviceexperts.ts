/**
 * Local test for the Service Experts (serviceexperts.com) scraper. Writes
 * serviceexperts-leads.xlsx. Plain fetch — no browser, no cookie. USA only.
 *
 * Run:  npx tsx scripts/test-serviceexperts.ts            (all US centers)
 *       SE_LIMIT=40 npx tsx scripts/test-serviceexperts.ts (quick capped check)
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeServiceExperts } from '../lib/scraping/serviceExperts';

async function main() {
  console.log('Scraping serviceexperts.com (US HVAC & plumbing centers)…');
  const leads = await scrapeServiceExperts();
  if (leads.length === 0) {
    console.log('No results — the sitemap or page format may have changed.');
    return;
  }

  const rows = leads.map((l) => ({
    Name: l.businessName,
    Phone: l.phone ?? '',
    Address: l.address ?? '',
    City: l.city ?? '',
    State: l.state ?? '',
    Zip: l.zip ?? '',
    Services: 'HVAC & Plumbing',
    'Page URL': l.sourceUrl ?? '',
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 30 }, { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 7 }, { wch: 9 }, { wch: 16 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Service Experts');
  const outPath = join(process.cwd(), 'serviceexperts-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} centers to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
