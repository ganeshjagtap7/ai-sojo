/**
 * Local test for the SideProjectors scraper. Writes sideprojectors-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-sideprojectors.ts             (default: ALL/complete)
 *       SP_LIMIT=800 npx tsx scripts/test-sideprojectors.ts  (cap ~500-800)
 *
 * For Sale only; pre-revenue excluded. Prices USD.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeSideProjectors } from '../lib/scraping/sideprojectors';

const usd = (n: number | null | undefined) => (n == null ? '' : `$${n.toLocaleString('en-US')}`);

// "10000-50000" -> "$10,000-$50,000/mo"; "undisclosed" -> "Undisclosed" (USD).
function fmtRevenue(r: string | null | undefined): string {
  if (!r) return '';
  if (/undisclosed/i.test(r)) return 'Undisclosed';
  if (/pre/i.test(r)) return 'Pre-revenue';
  const range = r.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return `$${(+range[1]).toLocaleString('en-US')}-$${(+range[2]).toLocaleString('en-US')}/mo`;
  const plus = r.match(/^(\d+)\+?$/);
  if (plus) return `$${(+plus[1]).toLocaleString('en-US')}+/mo`;
  return r;
}

async function main() {
  console.log('Scraping sideprojectors.com (For Sale, excl. pre-revenue)…');
  const leads = await scrapeSideProjectors();

  if (leads.length === 0) {
    console.log('No projects returned — the search token may be stale; refresh TOKEN in lib/scraping/sideprojectors.ts.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Type: l.categories[0] ?? '',
      'Asking Price': usd(l.askingPrice),
      'Price Note': (r.priceNote as string) ?? '',
      'Monthly Revenue': fmtRevenue(r.revenueRange as string),
      'Avg Monthly Users': (r.avgMonthlyUsers as string) ?? '',
      'Avg Monthly Views': (r.avgMonthlyViews as string) ?? '',
      Seller: (r.seller as string) ?? '',
      Verified: r.verified ? 'Yes' : '',
      Created: (r.createdAt as string) ?? '',
      Pitch: (r.pitch as string) ?? '',
      Description: (r.description as string) ?? '',
      'Project URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 18 }, { wch: 9 }, { wch: 20 }, { wch: 45 }, { wch: 60 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'SideProjectors');

  const outPath = join(process.cwd(), 'sideprojectors-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} projects to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
