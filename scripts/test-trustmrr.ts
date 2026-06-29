/**
 * Local test for the TrustMRR (trustmrr.com) scraper. Writes trustmrr-leads.xlsx.
 *
 * Run:  TMRR_LIMIT=300 npx tsx scripts/test-trustmrr.ts   (cap ~300 detail pages)
 *       npx tsx scripts/test-trustmrr.ts                   (ALL ~4772 — long)
 *
 * No account needed (sitemap + public detail pages). Captures ALL tracked startups
 * with a For Sale column; the for-sale ones (onSale) are the marketplace listings.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeTrustMRR } from '../lib/scraping/trustmrr';

const usd = (n: number | null | undefined) => (n == null ? '' : `$${Math.round(n).toLocaleString('en-US')}`);
const pct = (n: number | null | undefined) => (n == null ? '' : `${Math.round(n)}%`);
const mult = (n: number | null | undefined) => (n == null ? '' : `${n.toFixed(1)}x`);

async function main() {
  console.log('Scraping trustmrr.com (sitemap + public detail pages)…');
  const leads = await scrapeTrustMRR();
  if (leads.length === 0) {
    console.log('No startups — the sitemap or page format may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Category: (r.category as string) ?? '',
      'Sub-Category': (r.subCategory as string) ?? '',
      'For Sale': r.onSale ? 'Yes' : '',
      'Asking Price': usd(r.askingPrice as number),
      MRR: usd(r.mrr as number),
      'Revenue 30d': usd(r.last30DaysRevenue as number),
      'Total Revenue': usd(r.totalRevenue as number),
      Multiple: mult(r.multiple as number),
      'Growth 30d': pct(r.growth30d as number),
      'Profit Margin': pct(r.profitMargin as number),
      'Active Subs': (r.activeSubscriptions as number) ?? '',
      Founded: r.founded ? String(r.founded).slice(0, 10) : '',
      Verified: (r.verified as string) ?? '',
      Offers: (r.offerCount as number) ?? '',
      Pageviews: (r.pageviews as number) ?? '',
      Founder: (r.xFounderName as string) ?? '',
      'X Handle': r.xHandle ? `@${r.xHandle}` : '',
      'X Followers': (r.xFollowers as number) ?? '',
      'X Profile': (r.xProfileUrl as string) ?? '',
      Website: l.website ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 32 }, { wch: 60 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'TrustMRR');
  const outPath = join(process.cwd(), 'trustmrr-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} startups to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
