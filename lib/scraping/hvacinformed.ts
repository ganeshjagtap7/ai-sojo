// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch (no browser) — but HVACinformed is behind
// Imperva Incapsula, so it needs the `incap_ses_*` cookies replayed from your real
// Chrome. See scripts/test-hvacinformed.ts for setup.
//
// hvacinformed.com — a B2B directory of HVAC companies. We scrape CONTRACTORS in
// NORTH AMERICA (Canada + USA only — no Mexico), as skilled-trade local-business
// leads (name, address, phone, About). NOT a for-sale marketplace, so the deal
// fields stay empty.
//   Directory pages list contractors by country (paginated ?page=N):
//     /companies/contractor-canada/directory.html                  (158)
//     /companies/contractor-united-states-of-america/directory.html (409)
//   Each card gives the detail URL + name/description/location/tags; the detail
//   page adds the structured postal address, phone, and full About.
//   Incapsula rotates the incap_ses cookie via Set-Cookie, so we keep a cookie jar
//   and refresh it each response (replaying the original alone gets re-challenged).
//   Needs HV_COOKIE (the incap_ses_* cookies) and HV_UA in env or .env.local.
//   Default scrapes ALL (~567). Set HV_LIMIT=50 to cap. If it starts getting
//   blocked, refresh HV_COOKIE from your browser.

import { existsSync, readFileSync } from 'fs';
import { assertPublicSource } from '@/lib/scraping/scrapingPolicy';
import { join } from 'path';
import { RawLead, SearchCriteria } from '@/lib/types';

const SITE = 'https://www.hvacinformed.com';
const COUNTRIES = ['canada', 'united-states-of-america']; // North America = Canada + USA (Mexico has no working directory alias — it falls back to a global list)
const CONCURRENCY = process.env.HV_CONCURRENCY ? Math.max(1, parseInt(process.env.HV_CONCURRENCY, 10)) : 3;
const REQ_GAP_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function envv(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  const f = join(process.cwd(), '.env.local');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf-8').match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const limitFromEnv = (): number => {
  if (process.env.HV_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.HV_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

const clean = (s: string | undefined): string =>
  (s || '')
    .replace(/<[^>]+>/g, ' ')
    // numeric entities first (handles zero-padded forms like &#039;)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();

// region/country tags we don't want polluting the category list
const REGION_TAG = /^(canada|usa|united states( of america)?|north america|mexico)$/i;

const isBlocked = (html: string): boolean => /_Incapsula_Resource/i.test(html) || html.length < 1500;

// --- Incapsula client: keep a cookie jar and absorb the rotated incap_ses cookie. ---
class HvClient {
  private jar = new Map<string, string>();
  private ua: string;
  constructor() {
    const cookie = envv('HV_COOKIE');
    this.ua = envv('HV_UA') ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
    if (!cookie || !/incap_ses/.test(cookie)) {
      throw new Error('HV_COOKIE missing/invalid — add the incap_ses_* cookies to .env.local (see scripts/test-hvacinformed.ts header).');
    }
    for (const pair of cookie.split(';')) {
      const i = pair.indexOf('=');
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  private cookieHeader(): string {
    return Array.from(this.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  private absorb(res: Response): void {
    const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    for (const sc of set) {
      const first = sc.split(';')[0];
      const i = first.indexOf('=');
      if (i > 0) this.jar.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
    }
  }
  async get(url: string, tries = 4): Promise<string | null> {
    for (let t = 0; t < tries; t++) {
      let html = '';
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          headers: {
            'User-Agent': this.ua,
            Cookie: this.cookieHeader(),
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not.A/Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1',
          },
        });
        this.absorb(res);
        html = await res.text();
      } catch {
        /* network blip — retry */
      }
      if (html && !isBlocked(html)) return html;
      await sleep(1200 * (t + 1)); // back off so Incapsula reissues a fresh session cookie
    }
    return null;
  }
  // Directory pages matter most (one bad page truncates a whole country), so try
  // hard: the normal retries, then a long pause + a second full round.
  async getHard(url: string): Promise<string | null> {
    const a = await this.get(url, 5);
    if (a) return a;
    await sleep(8000);
    return this.get(url, 5);
  }
}

interface Card {
  url: string;
  name: string;
  description: string;
  location: string; // "City, Region, Country" from the card
  tags: string[];
}

// Parse the listing cards out of a directory page.
function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  const segs = html.split('<div class="h3 mt-2">').slice(1);
  for (const seg of segs) {
    const a = seg.match(/^\s*<a href="([^"]+\/companies\/[a-z0-9-]+\.html)"[^>]*title="([^"]*)"/);
    if (!a) continue;
    const tagsBlock = (seg.match(/text-uppercase">([\s\S]*?)<\/div>/) || [])[1] || '';
    const tags = Array.from(tagsBlock.matchAll(/<span[^>]*>([^<]+)<\/span>/g)).map((m) => clean(m[1])).filter(Boolean);
    cards.push({
      url: a[1].split('?')[0],
      name: clean(a[2]),
      description: clean((seg.match(/one-line-text[^"]*"[^>]*>([\s\S]*?)<\/p>/) || [])[1]),
      location: clean((seg.match(/companies-links font-italic">\s*([^<]+?)\s*<\/div>/) || [])[1]),
      tags,
    });
  }
  return cards;
}

const meta = (html: string, prop: string): string =>
  clean((html.match(new RegExp(`<meta itemprop="${prop}" content="([^"]*)"`, 'i')) || [])[1]);

// The site's filtered pagination degrades to a GLOBAL mix past a country's last
// real page (e.g. USA page 13+ returns UK/India/Germany/… contractors). Guard by
// keeping only cards whose card-country is USA or Canada — and only Contractors.
const NA_COUNTRY = /^(usa|u\.s\.a\.?|united states( of america)?|canada)$/i;
function isNorthAmericaContractor(card: Card): boolean {
  const country = (card.location.split(',').pop() || '').trim();
  if (!NA_COUNTRY.test(country)) return false;
  return card.tags.length === 0 || card.tags.some((t) => /contractor/i.test(t));
}

export async function scrapeHvacInformed(_criteria?: SearchCriteria): Promise<RawLead[]> {
  assertPublicSource('hvacinformed');
  const limit = limitFromEnv();
  const client = new HvClient();

  // --- 1. Enumerate contractor cards across Canada + USA (paginated) ---
  const byUrl = new Map<string, Card>();
  let expectedTotal = 0;
  const shortfalls: string[] = [];
  for (const country of COUNTRIES) {
    const base = `${SITE}/companies/contractor-${country}/directory.html`;
    const startSize = byUrl.size;
    let expected = 0;
    let bad = 0; // consecutive blocked pages
    let dry = 0; // consecutive pages with no new NA contractor
    for (let p = 1; p <= 30 && byUrl.size < limit; p++) {
      const url = p === 1 ? base : `${base}?page=${p}`;
      const html = await client.getHard(url);
      if (html === null) {
        if (p === 1) throw new Error(`Incapsula blocked the ${country} directory page 1 — refresh HV_COOKIE in .env.local and re-run.`);
        console.warn(`[HVACinformed] ${country} page ${p}: blocked after retries — skipping`);
        if (++bad >= 3) break; // give up this country after 3 bad pages in a row
        continue;
      }
      bad = 0;
      if (p === 1) {
        expected = parseInt(((html.match(/\(([\d,]+)\s+Found\)/i) || [])[1] || '0').replace(/,/g, ''), 10) || 0;
        expectedTotal += expected;
      }
      const cards = parseCards(html);
      if (cards.length === 0) break; // true end of pagination
      // keep only US/Canada contractors — drops the global tail past the last real page
      const na = cards.filter(isNorthAmericaContractor);
      let added = 0;
      for (const c of na) {
        if (!byUrl.has(c.url)) {
          byUrl.set(c.url, c);
          added++;
        }
      }
      const collected = byUrl.size - startSize;
      console.log(`[HVACinformed] ${country} page ${p}: +${added} NA (page had ${cards.length} cards; total ${byUrl.size})`);
      if (expected && collected >= expected) break; // got them all
      if (added === 0) {
        if (++dry >= 2) break; // two pages of nothing new for us → into the global tail, stop
      } else {
        dry = 0;
      }
      await sleep(REQ_GAP_MS);
    }
    const collected = byUrl.size - startSize;
    if (expected && collected < expected) shortfalls.push(`${country}: ${collected}/${expected}`);
  }
  const targets = Array.from(byUrl.values()).slice(0, limit === Infinity ? byUrl.size : limit);
  console.log(`[HVACinformed] contractors found: ${byUrl.size}${expectedTotal ? ` (expected ~${expectedTotal})` : ''}; fetching ${targets.length} detail pages…`);
  if (shortfalls.length) {
    console.warn(`[HVACinformed] note: fewer than the site's stated count (${shortfalls.join('; ')}) — the site's filtered pagination degrades to a global list past the last real page, so the tail isn't cleanly reachable. (If a page was blocked, refresh HV_COOKIE and re-run.)`);
  }

  // --- 2. Fetch + parse each detail page (parallel, gentle) ---
  const out: RawLead[] = [];
  let idx = 0;
  let done = 0;
  let blocked = 0;
  const worker = async () => {
    while (idx < targets.length) {
      const card = targets[idx++];
      const h = await client.get(card.url);
      if (h === null) {
        if (++blocked > 25) throw new Error('Incapsula keeps blocking — refresh HV_COOKIE and re-run (or lower HV_CONCURRENCY).');
      } else {
        const name = clean((h.match(/<h1 itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) || card.name;
        const street = meta(h, 'streetAddress');
        const city = meta(h, 'addressLocality');
        const region = meta(h, 'addressRegion');
        const zip = meta(h, 'postalCode');
        const country = meta(h, 'addressCountry');
        const phone = clean((h.match(/<li class="contact-icon">\s*([^<]*\d[^<]*)\s*<\/li>/i) || [])[1]);
        const about = clean((h.match(/<p itemprop="description"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]) || card.description;
        // location fallbacks from the card ("City, Region, Country")
        const lp = card.location.split(',').map((s) => s.trim());
        const categories = card.tags.filter((t) => !REGION_TAG.test(t));
        out.push({
          businessName: name,
          address: street || null,
          city: city || lp[0] || null,
          state: region || lp[1] || null,
          zip: zip || null,
          phone: phone || null,
          website: null,
          googleRating: null,
          reviewCount: null,
          categories,
          yearsInBusiness: null,
          employeeCount: null,
          bbbRating: null,
          bbbAccredited: null,
          source: 'hvacinformed' as const,
          sourceUrl: card.url,
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
            about: about || null,
            categories: categories.join(', ') || null,
            region: card.tags.find((t) => REGION_TAG.test(t)) || null,
            country: country || lp[2] || null,
            cardLocation: card.location || null,
          },
        });
      }
      if (++done % 50 === 0) console.log(`[HVACinformed] ${done}/${targets.length} (kept ${out.length}, blocked ${blocked})`);
      await sleep(REQ_GAP_MS + Math.floor(Math.random() * 150));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // group by country then state then name
  out.sort((a, b) => {
    const ac = ((a.rawData as { country?: string }).country) || '';
    const bc = ((b.rawData as { country?: string }).country) || '';
    return ac.localeCompare(bc) || (a.state || '').localeCompare(b.state || '') || a.businessName.localeCompare(b.businessName);
  });
  console.log(`[HVACinformed] captured: ${out.length}`);
  return out;
}
