/**
 * Local test for the Tobuz (tobuz.com) scraper. Writes tobuz-leads.xlsx.
 *
 * Run:  TOBUZ_LIMIT=500 npx tsx scripts/test-tobuz.ts   (cap ~500, recommended)
 *       npx tsx scripts/test-tobuz.ts                    (ALL ~10k — very long)
 *
 * A browser window opens (needed to clear Cloudflare). For Sale; contact is gated
 * (not captured). Price shown with its native currency (AED / USD / INR …).
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeTobuz } from '../lib/scraping/tobuz';

const money = (n: number | null | undefined, sym: string | null | undefined) => {
  if (n == null) return '';
  const v = n.toLocaleString('en-US');
  return sym ? `${sym} ${v}` : v;
};

async function main() {
  console.log('Scraping tobuz.com (browser list + detail pages)…');
  const leads = await scrapeTobuz();
  if (leads.length === 0) {
    console.log('No listings — Cloudflare may have blocked, or the markup changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Category: (r.category as string) ?? '',
      'Sub Category': (r.subCategory as string) ?? '',
      Price: money(l.askingPrice, r.currency as string) || (r.priceRaw as string) || '',
      City: l.city ?? '',
      Country: (r.country as string) ?? '',
      'Listing Type': (r.listingType as string) ?? '',
      'Year Established': (r.yearEstablished as string) ?? '',
      'Years Trading': (r.yearsTrading as string) ?? '',
      Employees: (r.employees as string) ?? '',
      'Company Type': (r.companyType as string) ?? '',
      Status: (r.status as string) ?? '',
      Rent: (r.rent as string) ?? '',
      Wages: (r.wages as string) ?? '',
      Features: (r.features as string) ?? '',
      Keywords: (r.keywords as string) ?? '',
      Posted: (r.posted as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 60 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Tobuz');
  const outPath = join(process.cwd(), 'tobuz-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
