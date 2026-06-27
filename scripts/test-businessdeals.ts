/**
 * Local test for the BusinessDeals.in scraper. Writes businessdeals-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-businessdeals.ts
 *
 * Pages through all ~5,542 listings via the pagination API (list-row fields only).
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeBusinessDeals } from '../lib/scraping/businessdeals';

async function main() {
  console.log('Scraping businessdeals.in (all pages, list fields)…');
  const leads = await scrapeBusinessDeals();

  if (leads.length === 0) {
    console.log('No listings returned — the pagination token/endpoint may have changed.');
    return;
  }

  const fmt = (n: number | null | undefined, c: string) =>
    n == null ? '' : `${c === 'USD' ? '$' : '₹'}${n.toLocaleString(c === 'USD' ? 'en-US' : 'en-IN')}`;

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as {
      type?: string; location?: string; description?: string; asking?: string; currency?: string;
      category?: string; turnover?: string; turnoverCurrency?: string; legalEntity?: string;
      subCategory?: string; listedBy?: string;
    };
    const cur = r.currency || 'INR';
    return {
      Name: l.businessName,
      Type: r.type ?? '',
      Category: r.category ?? '',
      'Sub-Category': r.subCategory ?? '',
      Location: r.location ?? '',
      Currency: cur,
      'Asking Price': fmt(l.askingPrice, cur),
      Turnover: fmt(l.annualRevenue, r.turnoverCurrency || cur),
      'Legal Entity': r.legalEntity ?? '',
      'Listed By': r.listedBy ?? '',
      Description: r.description ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 46 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 9 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 55 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'BusinessDeals');

  const outPath = join(process.cwd(), 'businessdeals-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
