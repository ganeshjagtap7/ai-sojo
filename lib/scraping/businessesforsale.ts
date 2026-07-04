// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser). See scripts/test-businessesforsale.ts.
//
// businessesforsale.com (US section) — global incumbent, ~16k US listings. The
// DETAIL pages are Cloudflare-protected (403), but the LIST pages are open + fully
// server-rendered, and each card already carries everything the detail shows: title,
// location, type, Asking Price / Revenue / Cash Flow (or Franchise Fee / Investment),
// a description snippet, and the detail URL. So we scrape the list only and never
// touch the blocked detail pages.
//
// CRITERIA-AWARE (Phase 2): the site's category slugs are NOT uniform
// ("plumbing-businesses-for-sale" but "restaurants-for-sale"), so instead of
// guessing a category slug we use the generic feed's two reliable, verified-live
// knobs — a location slug in the path and a free-text `keywords` query param:
//   state only       → /us/search/businesses-for-sale-in-georgia
//   state + industry → /us/search/businesses-for-sale-in-georgia?keywords=plumbing
//   industry only    → /us/search/businesses-for-sale?keywords=plumbing
//   generic feed     → /us/search/businesses-for-sale
//   pagination       → append "-<N>" to the path (before the query): …-in-georgia-2?keywords=…
// Page count is capped by SCRAPER_MAX_PAGES (default 3); BFSALE_LIMIT still caps cards.

import { RawLead, SearchCriteria } from '@/lib/types';
import { stateFullName } from '@/lib/utils/usStates';

const SITE = 'https://us.businessesforsale.com';

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Maps criteria to the site's own search: a base path (with optional location
 * slug) and a keywords query. Pagination appends "-<N>" to `path`, then `query`.
 */
function buildSearch(criteria?: SearchCriteria): { path: string; query: string } {
  const state = criteria?.location.state ? slug(stateFullName(criteria.location.state)) : '';
  const industry = criteria?.industry.primary?.trim() || '';
  const path = state ? `/us/search/businesses-for-sale-in-${state}` : '/us/search/businesses-for-sale';
  const query = industry ? `?keywords=${encodeURIComponent(industry)}` : '';
  return { path, query };
}
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const limitFromEnv = (): number => {
  if (process.env.BFSALE_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.BFSALE_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

const clean = (s: string | undefined): string =>
  (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&pound;/g, '£')
    .replace(/\s+/g, ' ')
    .trim();

// "$100K - $250K" / "$379,999" / "$1.2M" -> low-end number (null if none).
function parseUSD(raw: string | undefined): number | null {
  if (!raw) return null;
  const first = raw.split(/[-–]/)[0];
  const m = first.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] || '').toUpperCase();
  if (u === 'K') n *= 1e3;
  else if (u === 'M') n *= 1e6;
  else if (u === 'B') n *= 1e9;
  return Math.round(n);
}

interface Card {
  title: string;
  url: string;
  location: string;
  type: string;
  fields: Record<string, string>;
  description: string;
  badges: string;
}

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  // each listing is a <div class="result"> ... </div> block
  const parts = html.split('<div class="result">');
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    // title is the <a> inside the card's <h2> (works for both .aspx businesses
    // and /franchises/opportunities/... franchise links)
    const link = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const url = link[1].replace(/&amp;/g, '&');
    // Extract each known label directly (a stray "Details:" cell breaks generic
    // th/td pairing), anchoring on `<th>Label:</th><td>value</td>`.
    const fields: Record<string, string> = {};
    const LABELS = ['Asking Price', 'Sales Revenue', 'Revenue', 'Cash Flow', 'Franchise Fee', 'Investment', 'Lifestyle', 'Management', 'Location'];
    for (const lbl of LABELS) {
      const m = block.match(new RegExp(`<th[^>]*>\\s*${lbl}\\s*:?\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i'));
      if (m) fields[lbl] = clean(m[1]);
    }
    // longest <p> in the block = description snippet
    const paras = Array.from(block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)).map((m) => clean(m[1]));
    const description = paras.sort((a, b) => b.length - a.length)[0] || '';
    const badges = ['Relocatable', 'Work From Home', 'Home Based', 'New Franchise']
      .filter((b) => new RegExp(b.replace(/ /g, '\\s*'), 'i').test(block))
      .join(', ');
    const typeLabel = block.match(/class="label-(franchise|business)"/i);
    let location = fields['Location'] || '';
    if (!location) {
      const lm = url.match(/[?&]location=([^&]+)/);
      if (lm) location = decodeURIComponent(lm[1]);
    }
    cards.push({
      title: clean(link[2]),
      url,
      location,
      type: typeLabel ? typeLabel[1][0].toUpperCase() + typeLabel[1].slice(1).toLowerCase() : 'Franchise Fee' in fields ? 'Franchise' : 'Business',
      fields,
      description,
      badges,
    });
  }
  return cards;
}

export async function scrapeBusinessesForSale(criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const maxPages = Math.max(1, parseInt(process.env.SCRAPER_MAX_PAGES || '3', 10));
  const { path, query } = buildSearch(criteria);
  console.log(`[BForSale] search: ${path}${query} (max ${maxPages} pages)`);
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const cards: Card[] = [];
  const seen = new Set<string>();
  for (let page = 1; cards.length < limit && page <= maxPages; page++) {
    const url = page === 1 ? `${SITE}${path}${query}` : `${SITE}${path}-${page}${query}`;
    let html: string;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }
    const pageCards = parseCards(html);
    if (pageCards.length === 0) break;
    let fresh = 0;
    for (const c of pageCards) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      cards.push(c);
      fresh++;
      if (cards.length >= limit) break;
    }
    console.log(`[BForSale] page ${page}: +${fresh} (total ${cards.length})`);
    if (fresh === 0) break;
  }
  console.log(`[BForSale] listings: ${cards.length}`);

  return cards.map((c): RawLead => {
    const f = c.fields;
    return {
      businessName: c.title || 'Unknown',
      address: null,
      city: c.location || null,
      state: null,
      zip: null,
      phone: null,
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: [c.type],
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'businessesforsale' as const,
      sourceUrl: c.url,
      mrr: null,
      askingPrice: parseUSD(f['Asking Price']),
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: parseUSD(f['Revenue'] || f['Sales Revenue']),
      annualProfit: parseUSD(f['Cash Flow']),
      forSale: true,
      founderName: null,
      foundedDate: null,
      rawData: {
        type: c.type,
        location: c.location || null,
        askingPrice: f['Asking Price'] || null,
        revenue: f['Revenue'] || f['Sales Revenue'] || null,
        cashFlow: f['Cash Flow'] || null,
        franchiseFee: f['Franchise Fee'] || null,
        investment: f['Investment'] || null,
        lifestyle: f['Lifestyle'] || null,
        management: f['Management'] || null,
        badges: c.badges || null,
        description: c.description || null,
      },
    };
  });
}
