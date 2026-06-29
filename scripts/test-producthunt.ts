/**
 * Local test for the Product Hunt scraper. Writes producthunt-leads.xlsx.
 *
 * Setup once: generate a free developer token at
 *   https://www.producthunt.com/v2/oauth/applications  (Add application -> Create Token)
 * and put it in .env.local as:  PH_TOKEN=your_token_here
 *
 * Run:  PH_LIMIT=500 npx tsx scripts/test-producthunt.ts   (500 most-recent launches)
 *       npx tsx scripts/test-producthunt.ts                 (all, paginating back)
 *
 * Product-launch data (not for-sale): product + makers (name + PH profile link).
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeProductHunt } from '../lib/scraping/producthunt';

interface Maker { name: string; profile: string }

async function main() {
  console.log('Fetching Product Hunt launches (newest first)…');
  const leads = await scrapeProductHunt();
  if (leads.length === 0) {
    console.log('No products — check PH_TOKEN in .env.local.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    const makers = (r.makers as Maker[]) ?? [];
    return {
      Product: l.businessName,
      Tagline: (r.tagline as string) ?? '',
      Description: (r.description as string) ?? '',
      Website: l.website ?? '',
      Topics: (r.topics as string) ?? '',
      'Launch Date': r.launchDate ? String(r.launchDate).slice(0, 10) : '',
      'Founders / Team': makers.map((m) => m.name).filter(Boolean).join('; '),
      'Maker Profiles': makers.map((m) => m.profile).filter(Boolean).join('; '),
      'Product Hunt URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 28 }, { wch: 44 }, { wch: 60 }, { wch: 36 }, { wch: 28 }, { wch: 12 }, { wch: 30 }, { wch: 50 }, { wch: 46 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Product Hunt');
  const outPath = join(process.cwd(), 'producthunt-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} products to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
