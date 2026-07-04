/**
 * Local test for the Trustpilot (ca/www.trustpilot.com) scraper. Writes
 * trustpilot-leads.xlsx.
 *
 * Trustpilot is behind AWS WAF. This scraper drives a real Chrome (Playwright) that
 * passes the WAF and keeps its token alive — NO cookies to paste, no per-token cap.
 * A Chrome window opens and drives itself; don't close it (minimise is fine). AWS WAF
 * does not ban your IP, so this is safe to run for hours.
 * (Uses your installed Chrome via channel:'chrome' — usually nothing to install.)
 *
 * Tip: run scripts/count-trustpilot.ts first to size the job.
 *
 * Scope is CLI-controlled:
 *   npx tsx scripts/test-trustpilot.ts                                  (default focused set, US+CA)
 *   TP_CATEGORIES=home_garden TP_LIMIT=200 npx tsx scripts/test-trustpilot.ts
 *   TP_CATEGORIES=animals_pets TP_REGION=ca npx tsx scripts/test-trustpilot.ts
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import type { RawLead } from '../lib/types';
import { scrapeTrustpilot } from '../lib/scraping/trustpilot';

const outPath = join(process.cwd(), 'trustpilot-leads.xlsx');

// Write the current leads to the xlsx. Called at the end AND periodically / on
// Ctrl+C (via the callback below), so a long run can be stopped without losing data.
function writeXlsx(leads: RawLead[]): void {
  if (leads.length === 0) return;
  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Region: (r.region as string) ?? '',
      Category: (r.category as string) ?? '',
      'Sub-Category': (r.subCategory as string) ?? '',
      'Business Type': (r.businessType as string) ?? '',
      Rating: (r.trustScore as number) ?? '',
      Reviews: l.reviewCount ?? '',
      'All Categories': (r.categories as string) ?? '',
      Website: l.website ?? '',
      Phone: l.phone ?? '',
      Email: (r.email as string) ?? '',
      Address: l.address ?? '',
      City: l.city ?? '',
      Zip: l.zip ?? '',
      Country: (r.country as string) ?? '',
      'Trustpilot URL': l.sourceUrl ?? '',
    };
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 30 }, { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 9 }, { wch: 34 },
    { wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 9 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Trustpilot');
  XLSX.writeFile(wb, outPath);
}

async function main() {
  console.log('Scraping trustpilot.com (categories → review pages)…');
  const leads = await scrapeTrustpilot(undefined, writeXlsx); // writeXlsx also runs periodically + on Ctrl+C
  writeXlsx(leads);
  if (leads.length === 0) {
    console.log('No results — the WAF may have blocked, or the run was stopped before any company was scraped.');
    return;
  }
  console.log(`\n✓ Wrote ${leads.length} companies to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
