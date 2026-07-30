// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser, no cookie, no bot wall).
// See scripts/test-esa.ts.
//
// licensing.esasafe.com — Electrical Safety Authority (Ontario) Contractor Locator.
// The map tool is a Power Pages site whose markers come from ONE open JSON endpoint:
//   GET /contractor-locator-tool/data  → a 5.3 MB array of ~18,392 licensed
//   electrical contractors (all Ontario). No auth, no pagination.
// These are local-business leads (licensed electrical contractors) — NOT a for-sale
// marketplace, so deal fields stay empty.
//   Default keeps only "Valid" licences (~10,308 active = the real leads).
//   ESA_STATUS=all keeps every status; ESA_STATUS=Valid,Suspended for a custom set.
//   Query-based (Phase 2): filtered to the mandate's city (when given) and
//   capped at SCRAPER_MAX_ITEMS (default 150). One fetch either way — the
//   endpoint has no pagination — so the cap bounds output, not bandwidth.

import { RawLead, SearchCriteria } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/scraping/fetchWithTimeout';
import { assertPublicSource } from '@/lib/scraping/scrapingPolicy';

const DATA_URL = 'https://licensing.esasafe.com/contractor-locator-tool/data';
const PROFILE = 'https://licensing.esasafe.com/contractor-locator-tool/profile/?id=';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// work-type codes from the locator's filter panel (negatives = same type, inactive)
const WORKTYPES: Record<number, string> = {
  1: 'Residential',
  2: 'Commercial & Industrial',
  3: 'Pole Line',
  4: 'HVAC',
  6: 'High Voltage & Sub Station',
};
const workTypeLabel = (n: number): string => WORKTYPES[Math.abs(n)] || `Type ${Math.abs(n)}`;

// Raw record (abbreviated keys from the endpoint)
interface ESARecord {
  n: string; ln: string; ls: string; lv: boolean; s: string | null; u: string | null;
  c: string | null; p: string | null; cn: string | null; la: string | null; lo: string | null;
  ph: string | null; e: string | null; cp: string | null; w: string | null;
  wt: number[] | null; a: string; hc: boolean;
}

const maxItemsFromEnv = (fallbackEnv: string | undefined): number => {
  // Per-search cap: SCRAPER_MAX_ITEMS (global) or the scraper-specific legacy
  // env; a full-site sweep is never allowed in the request path.
  const n = parseInt(process.env.SCRAPER_MAX_ITEMS ?? fallbackEnv ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 150;
};

const keywordsOf = (criteria?: SearchCriteria): string[] => {
  if (!criteria) return [];
  return [criteria.industry.primary, ...criteria.industry.subSectors, ...criteria.industry.keywords]
    .join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
};

// ESA_STATUS: "Valid" (default), "all", or a comma list (e.g. "Valid,Suspended")
function statusFilter(): ((s: string | null) => boolean) {
  const raw = (process.env.ESA_STATUS || 'Valid').trim();
  if (raw.toLowerCase() === 'all') return () => true;
  const allowed = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return (s) => allowed.has((s || '').toLowerCase());
}

const normProvince = (p: string | null): string | null => {
  if (!p) return null;
  return /^ont(ario)?$/i.test(p.trim()) ? 'ON' : p.trim();
};

export async function scrapeEsaContractors(criteria?: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('esa');
  const limit = maxItemsFromEnv(process.env.ESA_LIMIT);
  const wantCity = (criteria?.location.city || '').trim().toLowerCase();
  const keep = statusFilter();

  console.log('[ESA] fetching contractor dataset…');
  const res = await fetchWithTimeout(DATA_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`[ESA] data endpoint returned ${res.status}`);
  const all = (await res.json()) as ESARecord[];
  console.log(`[ESA] ${all.length} total records; filtering by status…`);

  const out: RawLead[] = [];
  for (const r of all) {
    if (!keep(r.ls)) continue;
    // Mandate city filter (dataset is Ontario-wide; a city mandate shouldn't
    // return the whole province).
    if (wantCity && !(r.c || '').toLowerCase().includes(wantCity)) continue;
    if (out.length >= limit) break;
    const street = [r.s, r.u].filter(Boolean).join(', ') || null;
    const categories = Array.from(new Set((r.wt || []).map(workTypeLabel)));
    out.push({
      businessName: r.n,
      address: street,
      city: r.c || null,
      state: normProvince(r.p),
      zip: null, // not provided by the dataset
      phone: r.ph || null,
      website: r.w || null,
      googleRating: null,
      reviewCount: null,
      categories,
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'esa' as const,
      sourceUrl: r.a ? `${PROFILE}${r.a}` : null,
      mrr: null,
      askingPrice: null,
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: null,
      annualProfit: null,
      forSale: null,
      founderName: null,
      foundedDate: null,
      rawData: {
        licenceNumber: r.ln || null,
        licenceStatus: r.ls || null,
        licenceValid: r.lv,
        cellphone: r.cp || null,
        email: r.e || null,
        worktypes: categories.join(', ') || null,
        hasConvictions: r.hc,
        latitude: r.la || null,
        longitude: r.lo || null,
        country: r.cn || null,
        accountId: r.a || null,
      },
    });
  }

  // sort by city then name
  out.sort((a, b) => (a.city || '').localeCompare(b.city || '') || a.businessName.localeCompare(b.businessName));
  console.log(`[ESA] kept ${out.length} contractors (status filter: ${process.env.ESA_STATUS || 'Valid'})`);
  return out;
}
