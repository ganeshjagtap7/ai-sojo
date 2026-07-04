// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser, no bot wall). See
// scripts/test-serviceexperts.ts.
//
// serviceexperts.com — Service Experts HVAC & plumbing service centers (USA only;
// the sitemap lists 34 US state pages, no Canadian provinces). Hierarchy:
//   /locations/<state>/  →  center pages /<city>-<state>/  →  each has a clean
//   ld+json LocalBusiness (name, street, city, region, zip, phone, geo).
// Local-business leads — NOT a for-sale marketplace, so deal fields stay empty.
//   Default scrapes ALL US centers (~a few hundred). SE_LIMIT=50 caps.

import { RawLead, SearchCriteria } from '@/lib/types';

const SITE = 'https://www.serviceexperts.com';
const SITEMAP = `${SITE}/sitemap.xml`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CONCURRENCY = process.env.SE_CONCURRENCY ? Math.max(1, parseInt(process.env.SE_CONCURRENCY, 10)) : 8;

// 2-letter codes for the states Service Experts operates in (used to recognise a
// center URL /<city>-<xx>/ and exclude nav links like /about-us/).
const US_STATES = new Set([
  'al','az','ar','ca','co','ct','de','fl','ga','hi','ia','id','il','in','ks','ky','la','ma','md','me',
  'mi','mn','mo','ms','mt','nc','nd','ne','nh','nj','nm','nv','ny','oh','ok','or','pa','ri','sc','sd',
  'tn','tx','ut','va','vt','wa','wi','wv','wy','dc',
]);

const limitFromEnv = (): number => {
  if (process.env.SE_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.SE_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface LocalBiz {
  name?: string;
  telephone?: string;
  address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string };
  geo?: { latitude?: string; longitude?: string };
}

// the LocalBusiness ld+json on a center page
function parseLocalBusiness(html: string): LocalBiz | null {
  const blocks = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g));
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      const arr = Array.isArray(j) ? j : [j];
      for (const o of arr) {
        if (/LocalBusiness/i.test(String(o?.['@type'])) && o?.address) return o as LocalBiz;
      }
    } catch {
      /* skip malformed */
    }
  }
  return null;
}

export async function scrapeServiceExperts(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();

  // --- 1. State pages from the sitemap ---
  const sm = (await get(SITEMAP)) || '';
  const statePages = Array.from(new Set(
    Array.from(sm.matchAll(/<loc>\s*(https:\/\/www\.serviceexperts\.com\/locations\/[a-z-]+\/)\s*<\/loc>/gi))
      .map((m) => m[1])
      .filter((u) => !/\/locations\/$/.test(u)),
  ));
  console.log(`[ServiceExperts] state pages: ${statePages.length}`);

  // --- 2. Each state page → center URLs /<city>-<xx>/ ---
  const centers = new Set<string>();
  for (const sp of statePages) {
    const html = await get(sp);
    if (!html) continue;
    for (const m of html.matchAll(/href="(\/[a-z0-9-]+-([a-z]{2})\/)"/gi)) {
      if (US_STATES.has(m[2].toLowerCase())) centers.add(SITE + m[1]);
    }
  }
  const targets = Array.from(centers).slice(0, limit === Infinity ? centers.size : limit);
  console.log(`[ServiceExperts] centers found: ${centers.size}; fetching ${targets.length}…`);

  // --- 3. Each center page → ld+json LocalBusiness ---
  const out: RawLead[] = [];
  let idx = 0;
  let done = 0;
  const worker = async () => {
    while (idx < targets.length) {
      const url = targets[idx++];
      const html = await get(url);
      if (html) {
        const b = parseLocalBusiness(html);
        if (b && b.name) {
          const a = b.address || {};
          out.push({
            businessName: b.name,
            address: a.streetAddress || null,
            city: a.addressLocality || null,
            state: a.addressRegion || null,
            zip: a.postalCode || null,
            phone: b.telephone || null,
            website: url,
            googleRating: null,
            reviewCount: null,
            categories: ['HVAC', 'Plumbing'],
            yearsInBusiness: null,
            employeeCount: null,
            bbbRating: null,
            bbbAccredited: null,
            source: 'serviceexperts' as const,
            sourceUrl: url,
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
              latitude: b.geo?.latitude || null,
              longitude: b.geo?.longitude || null,
              services: 'HVAC & Plumbing',
            },
          });
        }
      }
      if (++done % 50 === 0) console.log(`[ServiceExperts] ${done}/${targets.length} (kept ${out.length})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // sort by state then city then name
  out.sort((a, b) =>
    (a.state || '').localeCompare(b.state || '') ||
    (a.city || '').localeCompare(b.city || '') ||
    a.businessName.localeCompare(b.businessName));
  console.log(`[ServiceExperts] captured: ${out.length}`);
  return out;
}
