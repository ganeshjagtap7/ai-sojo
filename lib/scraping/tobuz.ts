// ⚠️ LOCAL-ONLY (Phase 1). See scripts/test-tobuz.ts.
//
// tobuz.com — India + international business-for-sale marketplace (~10k listings,
// UAE/Gulf heavy, mixed currency). Behind Cloudflare. The list is AJAX-injected
// into #partialContainer (cards expose contact_business2(id,'slug',...) — no /L-
// anchors), paginated at /business/business-for-sale-investment-opportunities/<N>.
// Detail pages are server-rendered. So: drive a real browser to clear Cloudflare
// and enumerate id+slug per page, then fetch each SSR detail page via the same
// browser context (carries the CF clearance) — no per-listing rendering.
//   Default scrapes ALL (~10k, very long). Set TOBUZ_LIMIT=500 to cap.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://tobuz.com/business/business-for-sale-investment-opportunities';
const SITE = 'https://tobuz.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DETAIL_CONCURRENCY = 5;

const limitFromEnv = (): number => {
  if (process.env.TOBUZ_LIMIT === undefined) return Infinity; // default: complete
  const n = parseInt(process.env.TOBUZ_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

const CURRENCIES = ['AED', 'USD', 'INR', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'GBP', 'EUR', 'PKR'];
function parsePrice(raw: string): { amount: number | null; currency: string | null } {
  if (!raw) return { amount: null, currency: null };
  const cur = CURRENCIES.find((c) => raw.toUpperCase().includes(c)) || (/₹/.test(raw) ? 'INR' : /\$/.test(raw) ? 'USD' : null);
  const m = raw.replace(/,/g, '').match(/([\d.]+)/);
  return { amount: m ? Math.round(parseFloat(m[1])) : null, currency: cur };
}

// section content: <span class="business-description">LABEL</span><br> CONTENT </p>
function section(html: string, label: string): string {
  const re = new RegExp(`business-description[^>]*>\\s*${label}\\s*</span>\\s*<br\\s*/?>([\\s\\S]*?)</p>`, 'i');
  const m = html.match(re);
  return m ? clean(m[1]) : '';
}
// links inside a section (category / sub-category / keywords are <a> lists)
function sectionLinks(html: string, label: string): string {
  const re = new RegExp(`business-description[^>]*>\\s*${label}\\s*</span>([\\s\\S]*?)</p>`, 'i');
  const m = html.match(re);
  if (!m) return '';
  return Array.from(m[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)).map((x) => clean(x[1])).filter(Boolean).join(', ');
}

interface Detail {
  title: string;
  subtitle: string;
  posted: string;
  description: string;
  location: string;
  features: string;
  category: string;
  subCategory: string;
  keywords: string;
  listingType: string;
  price: string;
  table: Record<string, string>;
}

function parseDetail(html: string): Detail {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
  const table: Record<string, string> = {};
  for (const m of html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const k = clean(m[1]).replace(/\s*:\s*$/, '');
    const v = clean(m[2]);
    if (k && v && k.length < 60) table[k] = v;
  }
  return {
    title: clean(h1.split(/<br/i)[0]),
    subtitle: clean((h1.match(/<span>([\s\S]*?)<\/span>/) || [])[1] || ''),
    posted: clean((html.match(/Posted on:\s*([^<]+)</) || [])[1] || ''),
    description: section(html, 'Business Description'),
    location: section(html, 'Business Location'),
    features: section(html, 'Business Features').replace(/\n/g, ', '),
    category: sectionLinks(html, 'Business Category') || section(html, 'Business Category'),
    subCategory: sectionLinks(html, 'Business Sub Category'),
    keywords: sectionLinks(html, 'Keywords'),
    listingType: clean((html.match(/Listing Type\s*<br\s*\/?>\s*<span>([^<]+)<\/span>/i) || [])[1] || ''),
    price: clean((html.match(/Pricing\s*<br\s*\/?>\s*<span>([^<]+)<\/span>/i) || [])[1] || ''),
    table,
  };
}

export async function scrapeTobuz(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // --- 1. Enumerate id+slug per list page (browser clears Cloudflare) ---
    const seen = new Set<string>();
    const items: { id: string; slug: string }[] = [];
    for (let p = 1; items.length < limit; p++) {
      const url = p === 1 ? BASE : `${BASE}/${p}?layout=grid`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await page
        .waitForFunction(() => /contact_business2\(\d+/.test(document.body.innerHTML), { timeout: 30000 })
        .catch(() => {});
      const pairs = await page.evaluate(() => {
        const out: { id: string; slug: string }[] = [];
        const re = /contact_business2\((\d+),'([^']*)'/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(document.body.innerHTML))) out.push({ id: m[1], slug: m[2] });
        return out;
      });
      let fresh = 0;
      for (const it of pairs) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(it);
        fresh++;
        if (items.length >= limit) break;
      }
      console.log(`[Tobuz] page ${p}: +${fresh} (total ${items.length})`);
      if (fresh === 0) break; // ran out of pages
    }
    console.log(`[Tobuz] listings: ${items.length}. Fetching detail pages…`);

    // --- 2. Detail pages via the browser context (SSR, no render) ---
    const details = new Map<string, Detail>();
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const i = idx++;
        const it = items[i];
        const url = `${SITE}/business/${it.slug}/L-${it.id}`;
        try {
          const res = await context.request.get(url, { timeout: 30000 });
          if (res.ok()) details.set(it.id, parseDetail(await res.text()));
        } catch {
          /* skip */
        }
        if ((i + 1) % 50 === 0) console.log(`[Tobuz] detail ${i + 1}/${items.length}`);
      }
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[Tobuz] details fetched: ${details.size}/${items.length}`);

    // --- 3. Map to RawLead ---
    const thisYear = new Date().getFullYear();
    return items.map((it): RawLead => {
      const d = details.get(it.id);
      const t = d?.table ?? {};
      const { amount, currency } = parsePrice(d?.price || '');
      const [city, country] = (d?.location || '').split(',').map((s) => s.trim());
      const yearEst = parseInt(t['Year of Establishment'] || '', 10);
      const yearsTrading = parseInt(t['No of Years trading'] || '', 10);
      const employees = parseInt(t['No of Employee'] || '', 10);
      return {
        businessName: d?.title || it.slug.replace(/-/g, ' '),
        address: null,
        city: city || null,
        state: null,
        zip: null,
        phone: null, // contact is gated behind "View Contact" — not captured
        website: null,
        googleRating: null,
        reviewCount: null,
        categories: [d?.category, d?.subCategory].filter(Boolean) as string[],
        yearsInBusiness: Number.isFinite(yearsTrading)
          ? yearsTrading
          : Number.isFinite(yearEst) && yearEst > 1900
            ? thisYear - yearEst
            : null,
        employeeCount: Number.isFinite(employees) ? employees : null,
        bbbRating: null,
        bbbAccredited: null,
        source: 'tobuz' as const,
        sourceUrl: `${SITE}/business/${it.slug}/L-${it.id}`,
        mrr: null,
        askingPrice: amount, // mixed currency — see rawData.currency
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: null,
        annualProfit: null,
        forSale: true,
        founderName: null,
        foundedDate: t['Year of Establishment'] || null,
        rawData: {
          currency: currency,
          priceRaw: d?.price || null,
          subtitle: d?.subtitle || null,
          listingType: d?.listingType || null,
          posted: d?.posted || null,
          location: d?.location || null,
          country: country || null,
          category: d?.category || null,
          subCategory: d?.subCategory || null,
          features: d?.features || null,
          keywords: d?.keywords || null,
          yearEstablished: t['Year of Establishment'] || null,
          yearsTrading: t['No of Years trading'] || null,
          employees: t['No of Employee'] || null,
          companyType: t['Type'] || null,
          status: t['Status'] || null,
          plantFixtures: t['Included Plant & Fixture fittings'] || null,
          estimatedStock: t['Included Estimated Stock'] || null,
          rent: t['Rent'] || null,
          wages: t['Wages'] || null,
          description: d?.description || null,
        },
      };
    });
  } finally {
    await browser.close();
  }
}
