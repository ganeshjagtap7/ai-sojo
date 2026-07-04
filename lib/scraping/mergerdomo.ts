// ⚠️ LOCAL-ONLY (Phase 1). Plain fetch + saved session cookies (no browser at
// runtime). Run scripts/mergerdomo-login.ts once first. See scripts/test-mergerdomo-*.ts.
//
// mergerdomo.com — India mid-market M&A marketplace. Two marketplaces:
//   sale   = /marketplace/business-for-sale   (businesses for sale)
//   buyers = /marketplace/buyers-for-business (acquisition mandates)
// Both are server-rendered HTML, paginated via ?page=N. List cards are public;
// the rich detail pages are gated behind login, so we reuse mergerdomo-auth.json.
// A few detail fields stay locked even when logged in (EBITDA, PAT, Top Customer).

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://mergerdomo.com';
const AUTH = join(process.cwd(), 'mergerdomo-auth.json');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DETAIL_CONCURRENCY = 5;

export type MDMode = 'sale' | 'buyers';
const LIST_PATH: Record<MDMode, string> = {
  sale: '/marketplace/business-for-sale',
  buyers: '/marketplace/buyers-for-business',
};

const limitFromEnv = (): number => {
  if (process.env.MD_LIMIT === undefined) return Infinity; // default: complete
  const n = parseInt(process.env.MD_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

function cookieHeader(): string {
  if (!existsSync(AUTH)) throw new Error('mergerdomo-auth.json missing — run: npx tsx scripts/mergerdomo-login.ts');
  const data = JSON.parse(readFileSync(AUTH, 'utf-8')) as { cookies?: { name: string; value: string; domain?: string }[] };
  return (data.cookies ?? [])
    .filter((c) => (c.domain ?? '').includes('mergerdomo.com'))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();

// "₹128 Cr", "INR 70.03 Cr", "₹300 – 350 Cr" -> rupees (first number). Cr=1e7, Lakh=1e5.
function parseCr(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, '');
  const m = s.match(/([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/cr/i.test(s)) return Math.round(n * 1e7);
  if (/lakh|lac/i.test(s)) return Math.round(n * 1e5);
  return Math.round(n);
}

const grab = (re: RegExp, html: string): string => {
  const m = html.match(re);
  return m ? decode(m[1]) : '';
};

interface Card {
  title: string;
  date: string;
  premium: boolean;
  industries: string;
  region: string;
  dealType: string;
  eois: string;
  description: string;
  meta: string; // revenue (sale) / location line
  ticketLabel: string;
  ticketVal: string;
  detailUrl: string;
}

function parseCards(html: string): Card[] {
  const cards: Card[] = [];
  const re = /<article class="investor-card[\s\S]*?<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const c = m[0];
    const metas = Array.from(c.matchAll(/icard-meta-item"[^>]*>([\s\S]*?)<\/span>/g)).map((x) => decode(x[1]));
    cards.push({
      title: grab(/icard-type-label">([\s\S]*?)<\/div>/, c),
      date: grab(/icard-date">[\s\S]*?<\/i>\s*([\s\S]*?)<\/div>/, c),
      premium: /icard-premium-ribbon/.test(c),
      industries: grab(/data-industries="([^"]*)"/, c),
      region: grab(/data-location="([^"]*)"/, c),
      dealType: grab(/data-type="([^"]*)"/, c),
      eois: grab(/data-eois="([^"]*)"/, c),
      description: grab(/icard-desc">([\s\S]*?)<\/p>/, c),
      meta: metas.join(' | '),
      ticketLabel: grab(/icard-ticket-label">([\s\S]*?)<\/span>/, c),
      ticketVal: grab(/icard-ticket-val">([\s\S]*?)<\/span>/, c),
      detailUrl: grab(/<a href="(https:\/\/mergerdomo\.com\/(?:business-for-sale|buy-business)\/india\/[^"]+)"/, c),
    });
  }
  return cards;
}

interface Detail {
  dealId: string;
  postedBy: string;
  date: string;
  brief: string;
  fields: Record<string, string>;
  salesByYear: string; // "2025: 43.66 | 2024: 36.44"
}

function parseDetail(html: string): Detail {
  const fields: Record<string, string> = {};
  for (const m of html.matchAll(/text-body-secondary[^"]*">([^<]+)<\/p>\s*<p class="fw-bold[^"]*">([\s\S]*?)<\/p>/g)) {
    const label = decode(m[1]);
    const val = decode(m[2]);
    if (label && val && !/^[\s\u{1F500}-\u{1FAFF}]*$/u.test(val)) fields[label] = val; // skip lock-only values
  }
  // Business brief: from heading to the Proposal section
  let brief = '';
  const bi = html.search(/BUSINESS BRIEF/i);
  if (bi >= 0) {
    const slice = html.slice(bi, bi + 6000);
    const end = slice.search(/Proposal|Financial Information/i);
    brief = decode(slice.slice('BUSINESS BRIEF'.length, end > 0 ? end : 4000));
  }
  // Financial table: Sales row across year columns
  const headerYears = Array.from(html.matchAll(/<th[^>]*>\s*(\d{4})\s*\(in INR Cr\)/g)).map((x) => x[1]);
  let salesByYear = '';
  const salesRow = html.match(/Sales<\/h6>[\s\S]*?(?=<\/tr>)/i);
  if (salesRow && headerYears.length) {
    const cells = Array.from(salesRow[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((x) => decode(x[1]));
    salesByYear = headerYears
      .map((y, i) => {
        const v = cells[i];
        return `${y}: ${v && /\d/.test(v) ? `${v} Cr` : '—'}`; // figures are in INR Cr; '.'/'N.D' => —
      })
      .join(' | ');
  }
  // The header has tags between label and value ("Deal Id -</span> ISB1K368"),
  // so match these against a tag-stripped copy of the page.
  const text = decode(html);
  return {
    dealId: (text.match(/Deal Id\s*-\s*([A-Za-z0-9]+)/) || [])[1] || '',
    postedBy: (text.match(/Posted By\s*-\s*(.+?)\s+(?:Date|Bookmark|Contact)\b/) || [])[1] || '',
    date: (text.match(/Date\s*-\s*([\d/]+)/) || [])[1] || '',
    brief,
    fields,
    salesByYear,
  };
}

async function fetchHtml(url: string, cookie: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function scrapeMergerDomo(mode: MDMode, _criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const cookie = cookieHeader();

  // --- 1. List pages (?page=N) until empty or limit ---
  const cards: Card[] = [];
  for (let page = 1; cards.length < limit; page++) {
    const html = await fetchHtml(`${BASE}${LIST_PATH[mode]}?page=${page}`, cookie);
    if (!html) break;
    const pageCards = parseCards(html);
    if (pageCards.length === 0) break;
    for (const c of pageCards) {
      if (c.detailUrl && !cards.some((x) => x.detailUrl === c.detailUrl)) cards.push(c);
      if (cards.length >= limit) break;
    }
    console.log(`[MergerDomo:${mode}] listed ${cards.length} (page ${page})`);
  }
  console.log(`[MergerDomo:${mode}] listings: ${cards.length}. Fetching detail pages…`);

  // --- 2. Detail enrichment ---
  const details = new Map<string, Detail>();
  let idx = 0;
  const worker = async () => {
    while (idx < cards.length) {
      const i = idx++;
      const html = await fetchHtml(cards[i].detailUrl, cookie);
      if (html) details.set(cards[i].detailUrl, parseDetail(html));
      if ((i + 1) % 25 === 0) console.log(`[MergerDomo:${mode}] detail ${i + 1}/${cards.length}`);
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  console.log(`[MergerDomo:${mode}] details fetched: ${details.size}/${cards.length}`);

  // --- 3. Map to RawLead ---
  return cards.map((c): RawLead => {
    const d = details.get(c.detailUrl);
    const f = d?.fields ?? {};
    const isSale = mode === 'sale';
    const dealSize = f['Deal Size'] || c.ticketVal; // asking range (sale) / budget range (buyers)
    const revenueStr = isSale ? (f['Revenue'] || c.meta.replace(/^Revenue:\s*/i, '')) : '';
    return {
      businessName: c.title || 'Unknown',
      address: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      website: null,
      googleRating: null,
      reviewCount: null,
      categories: [f['Industry'] || c.industries, f['Sub Industry']].filter(Boolean) as string[],
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'mergerdomo' as const,
      sourceUrl: c.detailUrl || `${BASE}${LIST_PATH[mode]}`,
      mrr: null,
      askingPrice: isSale ? parseCr(dealSize) : null, // buyers: it's a budget, not an asking price
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: isSale ? parseCr(revenueStr) : null,
      annualProfit: null,
      forSale: isSale, // buyers are demand-side mandates
      founderName: null,
      foundedDate: null,
      rawData: {
        mode,
        dealId: d?.dealId || null,
        postedBy: d?.postedBy || null,
        date: d?.date || c.date || null,
        premium: c.premium,
        liveEois: c.eois || null,
        industry: f['Industry'] || c.industries || null,
        subIndustry: f['Sub Industry'] || null,
        natureOfBusiness: f['Nature of Business'] || null,
        sector: f['Sector'] || null,
        region: f['Region'] || c.region || null,
        location: f['Location'] || null,
        dealSize: dealSize || null, // asking range (sale) / budget range (buyers)
        revenue: revenueStr || null,
        reasonForSelloff: f['Reason for sell-off'] || null,
        openForDilution: f['Open For Dilution'] || null,
        openForDistressed: f['Open for Distressed Assets'] || null,
        justification: f['Justification'] || null,
        targetRequirement: f['Target Requirement'] || null,
        salesByYear: d?.salesByYear || null,
        description: c.description || null,
        businessBrief: d?.brief || null,
      },
    };
  });
}

export const scrapeMergerDomoSale = (c?: SearchCriteria) => scrapeMergerDomo('sale', c);
export const scrapeMergerDomoBuyers = (c?: SearchCriteria) => scrapeMergerDomo('buyers', c);
