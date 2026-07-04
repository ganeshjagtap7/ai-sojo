/**
 * Local test for the BusinessesForSale.com (US) scraper. Writes businessesforsale-leads.xlsx.
 *
 * CRITERIA-AWARE (Phase 2): targets the site's own search URL from industry + state,
 * capped by SCRAPER_MAX_PAGES (default 3). Defaults to plumbing / GA.
 *
 * Run:  npx tsx scripts/test-businessesforsale.ts                          (plumbing, GA)
 *       BFS_INDUSTRY=restaurant BFS_STATE=CA npx tsx scripts/test-businessesforsale.ts
 *       BFS_INDUSTRY= BFS_STATE= npx tsx scripts/test-businessesforsale.ts (generic feed)
 *       SCRAPER_MAX_PAGES=1 npx tsx scripts/test-businessesforsale.ts      (1 page only)
 *
 * US listings only. Businesses + franchises (Type column). List-only (detail pages
 * are Cloudflare-blocked, but the cards carry the same data). USD prices kept as the
 * site's labels (ranges like "$100K - $250K" or exact "$379,999").
 */
import { join } from 'path';
import * as XLSX from 'xlsx';
import { scrapeBusinessesForSale } from '../lib/scraping/businessesforsale';
import { SearchCriteria } from '../lib/types';

function crit(over: Partial<{ state: string; primary: string }>): SearchCriteria {
  return {
    location: { city: '', state: over.state ?? '', country: 'US', radiusMiles: 25 },
    industry: { primary: over.primary ?? '', subSectors: [], keywords: [] },
    businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
    preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
    searcherType: 'self_funded',
  };
}

async function main() {
  const criteria = crit({
    primary: process.env.BFS_INDUSTRY ?? 'plumbing',
    state: process.env.BFS_STATE ?? 'GA',
  });
  console.log(`Scraping us.businessesforsale.com — industry="${criteria.industry.primary}" state="${criteria.location.state}"…`);
  const leads = await scrapeBusinessesForSale(criteria);
  if (leads.length === 0) {
    console.log('No listings — the list markup may have changed.');
    return;
  }

  const rows = leads.map((l) => {
    const r = (l.rawData ?? {}) as Record<string, unknown>;
    return {
      Name: l.businessName,
      Type: (r.type as string) ?? '',
      Location: (r.location as string) ?? '',
      'Asking Price': (r.askingPrice as string) ?? '',
      Revenue: (r.revenue as string) ?? '',
      'Cash Flow': (r.cashFlow as string) ?? '',
      'Franchise Fee': (r.franchiseFee as string) ?? '',
      Investment: (r.investment as string) ?? '',
      Lifestyle: (r.lifestyle as string) ?? '',
      Management: (r.management as string) ?? '',
      Badges: (r.badges as string) ?? '',
      Description: (r.description as string) ?? '',
      'Listing URL': l.sourceUrl ?? '',
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 46 }, { wch: 11 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 70 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'BusinessesForSale US');
  const outPath = join(process.cwd(), 'businessesforsale-leads.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✓ Wrote ${leads.length} listings to ${outPath}`);
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
