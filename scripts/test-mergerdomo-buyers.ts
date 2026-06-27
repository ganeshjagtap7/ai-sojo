/**
 * Local test — MergerDomo BUYERS (acquisition mandates). Writes mergerdomo-buyers-leads.xlsx.
 *
 * Run mergerdomo-login.ts once first (saves the session), then:
 *   MD_LIMIT=20 npx tsx scripts/test-mergerdomo-buyers.ts   (cap ~20, quick check)
 *   npx tsx scripts/test-mergerdomo-buyers.ts               (ALL ~238)
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeMergerDomoBuyers } from '../lib/scraping/mergerdomo';

async function main() {
  console.log('Scraping mergerdomo.com — buyers / acquisition mandates…');
  const leads = await scrapeMergerDomoBuyers();
  if (leads.length === 0) {
    console.log('No buyers — session may have expired (re-run mergerdomo-login.ts) or markup changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      'Posted By': (r.postedBy as string) ?? '',
      Date: (r.date as string) ?? '',
      Premium: r.premium ? 'Yes' : '',
      Industry: (r.industry as string) ?? '',
      'Sub Industry': (r.subIndustry as string) ?? '',
      Region: (r.region as string) ?? '',
      Location: (r.location as string) ?? '',
      'Budget (Deal Size)': (r.dealSize as string) ?? '',
      'Open for Distressed': (r.openForDistressed as string) ?? '',
      'Target Requirement': (r.targetRequirement as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 50 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 28 },
    { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 60 }, { wch: 55 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'MergerDomo Buyers');
  const outPath = join(process.cwd(), 'mergerdomo-buyers-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} buyer mandates to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
