/**
 * Local test — MergerDomo BUSINESSES FOR SALE. Writes mergerdomo-sale-leads.xlsx.
 *
 * Run mergerdomo-login.ts once first (saves the session), then:
 *   MD_LIMIT=20 npx tsx scripts/test-mergerdomo-sale.ts   (cap ~20, quick check)
 *   npx tsx scripts/test-mergerdomo-sale.ts                (ALL ~149)
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeMergerDomoSale } from '../lib/scraping/mergerdomo';

async function main() {
  console.log('Scraping mergerdomo.com — businesses for sale…');
  const leads = await scrapeMergerDomoSale();
  if (leads.length === 0) {
    console.log('No listings — session may have expired (re-run mergerdomo-login.ts) or markup changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      'Posted By': (r.postedBy as string) ?? '',
      Date: (r.date as string) ?? '',
      Premium: r.premium ? 'Yes' : '',
      'Live EOIs': (r.liveEois as string) ?? '',
      Industry: (r.industry as string) ?? '',
      'Sub Industry': (r.subIndustry as string) ?? '',
      'Nature of Business': (r.natureOfBusiness as string) ?? '',
      Sector: (r.sector as string) ?? '',
      Region: (r.region as string) ?? '',
      Location: (r.location as string) ?? '',
      'Asking Price (Deal Size)': (r.dealSize as string) ?? '',
      Revenue: (r.revenue as string) ?? '',
      'Sales by Year': (r.salesByYear as string) ?? '',
      'Open for Dilution': (r.openForDilution as string) ?? '',
      Justification: (r.justification as string) ?? '',
      'Business Brief': (r.businessBrief as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 46 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 9 }, { wch: 22 }, { wch: 28 },
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 28 },
    { wch: 20 }, { wch: 50 }, { wch: 70 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'MergerDomo Sale');
  const outPath = join(process.cwd(), 'mergerdomo-sale-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} for-sale listings to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
