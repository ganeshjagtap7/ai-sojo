/**
 * Local test for the HVACinformed (hvacinformed.com) scraper. Writes
 * hvacinformed-leads.xlsx.
 *
 * hvacinformed.com is behind Imperva Incapsula. Plain fetch works by replaying the
 * `incap_ses_*` cookies + matching User-Agent from your real Chrome:
 *   1. Open https://www.hvacinformed.com/companies/contractor-canada/directory.html
 *      in Chrome, let it load (passes Incapsula).
 *   2. Console: copy `document.cookie` (it includes the incap_ses_* cookies).
 *      Console: `navigator.userAgent` → copy that string.
 *   3. Put both in .env.local:
 *        HV_COOKIE='<document.cookie>'
 *        HV_UA='<navigator.userAgent>'
 *   (If a run starts failing with "Incapsula blocked", just refresh HV_COOKIE by
 *    reloading the page and re-copying document.cookie.)
 *
 * Scope: HVAC CONTRACTORS in North America (Canada + USA, ~567). Skilled-trade
 * local-business leads — name, address, phone, About.
 *
 * Run:  HV_LIMIT=50 npx tsx scripts/test-hvacinformed.ts   (cap 50 — quick check)
 *       npx tsx scripts/test-hvacinformed.ts               (ALL ~567)
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeHvacInformed } from '../lib/scraping/hvacinformed';

async function main() {
  console.log('Scraping hvacinformed.com (Canada + USA contractors)…');
  const leads = await scrapeHvacInformed();
  if (leads.length === 0) {
    console.log('No results — check HV_COOKIE/HV_UA in .env.local (cookie may have expired).');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Categories: (r.categories as string) ?? '',
      Phone: l.phone ?? '',
      Address: l.address ?? '',
      City: l.city ?? '',
      'State / Province': l.state ?? '',
      Zip: l.zip ?? '',
      Country: (r.country as string) ?? '',
      Region: (r.region as string) ?? '',
      About: (r.about as string) ?? '',
      'Profile URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 30 }, { wch: 26 }, { wch: 18 }, { wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 11 }, { wch: 14 },
    { wch: 14 }, { wch: 70 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'HVAC Contractors');
  const outPath = join(process.cwd(), 'hvacinformed-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} contractors to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
