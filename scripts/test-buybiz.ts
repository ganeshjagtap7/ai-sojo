/**
 * Local test for the buybiz.co.in (BuyBizApp) scraper. Writes buybiz-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-buybiz.ts
 *
 * One JSON API call -> all listings across every category (Small Business,
 * Company, Trademark, Patent, Copyrights, Be Investor). Contact is public here.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeBuyBiz } from '../lib/scraping/buybiz';

// Format a money value with the row's native currency symbol ($ / ₹). Accepts a
// number (Price) or a raw string from a custom field ("100000"). Blank stays blank.
const money = (val: number | string | null | undefined, sym: string | null | undefined) => {
  if (val == null || val === '') return '';
  const n = Number(String(val).replace(/[^\d.]/g, ''));
  const v = Number.isFinite(n) && n > 0 ? n.toLocaleString('en-IN') : String(val);
  return sym ? `${sym} ${v}` : v;
};

async function main() {
  console.log('Scraping buybiz.co.in (single JSON API call)…');
  const leads = await scrapeBuyBiz();

  if (leads.length === 0) {
    console.log('No listings — the get-item API may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    const sym = r.currency as string;
    return {
      Name: l.businessName,
      Category: (r.category as string) ?? '',
      Price: money(l.askingPrice, sym),
      Location: (r.location as string) ?? '',
      'Year Started': (r.yearStarted as string) ?? '',
      Type: (r.type as string) ?? '',
      Employees: (r.employees as string) ?? '',
      'Turnover (Annual)': money(r.turnoverAnnual as string, sym),
      'Monthly Fixed Exp.': money(r.monthlyFixedExpenses as string, sym),
      'Investment Ask': money(r.investmentAsk as string, sym),
      Sector: (r.sector as string) ?? '',
      'GST Registered': (r.gstRegistered as string) ?? '',
      Seller: (r.sellerName as string) ?? '',
      Email: (r.sellerEmail as string) ?? '',
      Posted: r.postedAt ? String(r.postedAt).slice(0, 10) : '',
      'Other Details': (r.otherDetails as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 42 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 28 },
    { wch: 12 }, { wch: 50 }, { wch: 60 }, { wch: 48 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'BuyBiz');

  const outPath = join(process.cwd(), 'buybiz-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
