/**
 * Local test for the Motion Invest scraper. Writes motioninvest-leads.xlsx.
 *
 * Prereq: npx tsx scripts/motioninvest-login.ts   (data is login-gated)
 * Run:    npx tsx scripts/test-motioninvest.ts
 *   (if 0 listings, re-run: HEADED=1 npx tsx scripts/test-motioninvest.ts)
 *
 * NOTE: "Backlinks & SEO analysis" is not available on Motion Invest, so it's
 * not a column here.
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeMotionInvest } from '../lib/scraping/motioninvest';

function money(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toLocaleString('en-US')}`;
}

async function main() {
  console.log('Scraping motioninvest.com/marketplace (list + detail pages)…');
  const leads = await scrapeMotionInvest();

  if (leads.length === 0) {
    console.log('No listings — if blocked headless, re-run: HEADED=1 npx tsx scripts/test-motioninvest.ts');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as {
      type?: string; monthlyViews?: string; subscribers?: string; totalViews?: string;
      last12Avg?: string; overview?: string;
    };
    return {
      Name: l.businessName,
      Type: r.type ?? '',
      Niche: l.categories[1] ?? '',
      'Monthly Income': money(l.mrr),
      'Monthly Views': r.monthlyViews || r.totalViews || '',
      'Asking Price': money(l.askingPrice),
      'Income Multiple': l.revenueMultiple == null ? '' : `${l.revenueMultiple}x`,
      Established: l.foundedDate ?? '',
      'Total Income (12mo)': money(l.annualRevenue),
      'Last 12mo Avg': r.last12Avg ? `$${r.last12Avg}` : '',
      'Short Description': r.overview || '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 13 },
    { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 13 }, { wch: 60 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Motion Invest');

  const outPath = join(process.cwd(), 'motioninvest-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
  console.log('Open it in Excel or Numbers to review.');
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
