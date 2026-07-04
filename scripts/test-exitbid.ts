/**
 * Local test for the ExitBid scraper. Writes exitbid-leads.xlsx.
 *
 * Run:  npx tsx scripts/test-exitbid.ts
 *
 * Captures the auctions feed (all ~12-14 live auctions, full detail). Prices USD.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeExitBid } from '../lib/scraping/exitbid';

const usd = (n: number | null | undefined) => (n == null ? '' : `$${n.toLocaleString('en-US')}`);

async function main() {
  console.log('Scraping exitbid.io auctions…');
  const leads = await scrapeExitBid();

  if (leads.length === 0) {
    console.log('No auctions returned — the feed structure may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      'Business Type': (r.businessType as string) ?? '',
      Industry: (r.industry as string) ?? '',
      Stage: (r.stage as string) ?? '',
      'One-liner': (r.oneLiner as string) ?? '',
      'Monthly Revenue': (r.monthlyRevenue as string) ?? '',
      'Expenses %': (r.expensesPercent as string) ?? '',
      Users: (r.users as string) ?? '',
      'Business Age': (r.businessAge as string) ?? '',
      'Growth Trend': (r.growthTrend as string) ?? '',
      'Tech Stack': (r.techStack as string) ?? '',
      'Starting Price': usd(r.startingPrice as number),
      'Current Bid': usd(r.currentBid as number),
      Reserve: usd(r.reserve as number),
      Bids: (r.bidCount as number) ?? 0,
      'Ends At': (r.endsAt as string) ?? '',
      Website: l.website ?? '',
      'Selling Reason': (r.sellingReason as string) ?? '',
      Description: (r.description as string) ?? '',
      'Auction URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 45 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 6 }, { wch: 22 },
    { wch: 28 }, { wch: 16 }, { wch: 60 }, { wch: 52 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'ExitBid Auctions');

  const outPath = join(process.cwd(), 'exitbid-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} auctions to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
