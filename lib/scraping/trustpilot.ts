// ⚠️ LOCAL-ONLY (Phase 1). Headed real Chrome via Playwright. Trustpilot is behind
// AWS WAF; instead of replaying a short-lived cookie, we drive a real browser that
// keeps the WAF token alive itself — so large/all-category runs go unattended (no
// cookies to paste, no ~175-per-token cap). AWS WAF does NOT ban the IP, so this is
// safe to run for hours. See scripts/test-trustpilot.ts.
//
// trustpilot.com — review directory. We scrape a chosen set of top-level CATEGORIES
// in NORTH AMERICA (Canada via ca.trustpilot.com + USA via www.trustpilot.com) as
// local-business leads: name, website, Trustpilot rating + review count, address,
// phone, email, categories. NOT a for-sale marketplace, so deal fields stay empty.
//   Category pages (paginated ?page=N) list /review/<domain> links; each review page
//   embeds the data in __NEXT_DATA__.props.pageProps.businessUnit (+ contactInfo).
//   CLI knobs (all optional):
//     TP_CATEGORIES=home_garden,home_services | all   (default: a focused set)
//     TP_REGION=ca|us                                  one region only (default: both)
//     TP_LIMIT=2000                                    cap companies PER REGION
//     TP_CONCURRENCY=3                                 number of browser tabs
//   A Chrome window opens and drives itself — don't close it (you can minimise it).

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const DEFAULT_CATEGORIES = [
  'home_garden', 'home_services', 'construction_manufacturing',
  'vehicles_transportation', 'utilities', 'electronics_technology',
];
const ALL_CATEGORIES = [
  'animals_pets', 'beauty_wellbeing', 'business_services', 'construction_manufacturing',
  'education_training', 'electronics_technology', 'events_entertainment', 'food_beverages_tobacco',
  'health_medical', 'hobbies_crafts', 'home_garden', 'home_services', 'legal_services_government',
  'media_publishing', 'money_insurance', 'public_local_services', 'restaurants_bars',
  'shopping_fashion', 'sports', 'travel_vacation', 'utilities', 'vehicles_transportation',
];
const categoriesFromEnv = (): string[] => {
  const raw = (process.env.TP_CATEGORIES || '').trim();
  if (!raw) return DEFAULT_CATEGORIES;
  if (raw.toLowerCase() === 'all') return ALL_CATEGORIES;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_CATEGORIES;
};

const CONCURRENCY = process.env.TP_CONCURRENCY ? Math.max(1, parseInt(process.env.TP_CONCURRENCY, 10)) : 3;
const REQ_GAP_MS = 150;

const ALL_HOSTS = [
  { host: 'ca.trustpilot.com', region: 'CA' },
  { host: 'www.trustpilot.com', region: 'US' },
];
const hostsFromEnv = () => {
  const r = (process.env.TP_REGION || '').toLowerCase();
  if (r === 'ca' || r === 'canada') return ALL_HOSTS.filter((h) => h.region === 'CA');
  if (r === 'us' || r === 'usa') return ALL_HOSTS.filter((h) => h.region === 'US');
  return ALL_HOSTS;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const limitFromEnv = (): number => {
  if (process.env.TP_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.TP_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

// --- Real Chrome that passes AWS WAF and keeps the token alive across navigations ---
class TpBrowser {
  private browser!: Browser;
  private context!: BrowserContext;
  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    this.context = await this.browser.newContext({ viewport: { width: 1400, height: 900 } });
    await this.context.addInitScript({
      content:
        'globalThis.__name=globalThis.__name||function(f){return f};' +
        'Object.defineProperty(navigator,"webdriver",{get:()=>undefined});',
    });
    // priming nav so the WAF challenge is solved once up front
    const p = await this.context.newPage();
    await p.goto('https://www.trustpilot.com/categories', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await this.waitReal(p).catch(() => {});
    await p.close();
  }
  newPage(): Promise<Page> { return this.context.newPage(); }
  private async waitReal(page: Page): Promise<void> {
    await page.waitForFunction(
      () => !/Verifying your connection/i.test(document.title) &&
        (!!document.getElementById('__NEXT_DATA__') || /Companies\s*\(/.test(document.body.innerText || '')),
      { timeout: 45000 },
    );
  }
  async get(page: Page, url: string): Promise<string | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.waitReal(page);
      const html = await page.content();
      return /__NEXT_DATA__/.test(html) ? html : null;
    } catch {
      try {
        const html = await page.content();
        return /__NEXT_DATA__/.test(html) ? html : null;
      } catch {
        return null;
      }
    }
  }
  async close(): Promise<void> { await this.browser?.close(); }
}

interface BusinessUnit {
  displayName?: string;
  identifyingName?: string;
  numberOfReviews?: number;
  trustScore?: number;
  websiteUrl?: string;
  isClaimed?: boolean;
  isClosed?: boolean;
  categories?: { name?: string; isPrimary?: boolean }[];
  breadcrumb?: { topLevelDisplayName?: string; midLevelDisplayName?: string; bottomLevelDisplayName?: string };
  contactInfo?: { email?: string; address?: string; city?: string; country?: string; phone?: string; zipCode?: string };
}

function parseBusinessUnit(html: string): BusinessUnit | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.props?.pageProps?.businessUnit || null;
  } catch {
    return null;
  }
}

const categoryCount = (html: string): number =>
  parseInt(((html.match(/Companies\s*\(([\d,]+)\)/i) || [])[1] || '0').replace(/,/g, ''), 10) || 0;

// Count-only pass: load page 1 of each category × region and read "Companies (N)".
export async function countTrustpilotCategories(): Promise<{ region: string; category: string; count: number }[]> {
  const categories = categoriesFromEnv();
  const hosts = hostsFromEnv();
  const tb = new TpBrowser();
  await tb.init();
  const page = await tb.newPage();
  const rows: { region: string; category: string; count: number }[] = [];
  try {
    for (const { host, region } of hosts) {
      for (const cat of categories) {
        const html = await tb.get(page, `https://${host}/categories/${cat}`);
        const count = html ? categoryCount(html) : -1;
        console.log(`[Trustpilot count] ${region}/${cat}: ${count < 0 ? 'BLOCKED' : count}`);
        rows.push({ region, category: cat, count: Math.max(count, 0) });
        await sleep(REQ_GAP_MS);
      }
    }
  } finally {
    await tb.close();
  }
  return rows;
}

// `save` (optional) is called every ~200 companies and on Ctrl+C with everything
// scraped so far, so a long run can be stopped anytime without losing progress.
export async function scrapeTrustpilot(
  _criteria?: SearchCriteria,
  save?: (leads: RawLead[]) => void,
): Promise<RawLead[]> {
  const limit = limitFromEnv();
  const categories = categoriesFromEnv();
  const hosts = hostsFromEnv();
  console.log(`[Trustpilot] categories: ${categories.join(', ')} | regions: ${hosts.map((h) => h.region).join('+')}`);

  const tb = new TpBrowser();
  console.log('[Trustpilot] launching Chrome + passing AWS WAF…');
  await tb.init();
  try {
    // --- 1. Enumerate /review/<domain> URLs across category × region pages ---
    const targets: { url: string; region: string }[] = [];
    const seen = new Set<string>();
    const ep = await tb.newPage();
    for (const { host, region } of hosts) {
      let regionCount = 0; // TP_LIMIT is PER REGION
      for (const cat of categories) {
        if (regionCount >= limit) break;
        let expected = 0;
        for (let p = 1; p <= 80 && regionCount < limit; p++) {
          const url = `https://${host}/categories/${cat}${p === 1 ? '' : `?page=${p}`}`;
          const html = await tb.get(ep, url);
          if (html === null) {
            console.warn(`[Trustpilot] ${region}/${cat} page ${p}: no data — skipping`);
            break;
          }
          if (p === 1) expected = categoryCount(html);
          const links = Array.from(html.matchAll(/href="(\/review\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,})"/gi)).map((mm) => mm[1]);
          let added = 0;
          for (const rel of links) {
            if (regionCount >= limit) break;
            const key = `${region}:${rel}`;
            if (!seen.has(key)) {
              seen.add(key);
              targets.push({ url: `https://${host}${rel}`, region });
              added++;
              regionCount++;
            }
          }
          if (added === 0) break; // past the last page
          await sleep(REQ_GAP_MS);
        }
        console.log(`[Trustpilot] ${region}/${cat}: listed ~${expected || '?'} (${region} so far ${regionCount})`);
      }
    }
    await ep.close();
    console.log(`[Trustpilot] companies to fetch: ${targets.length}…`);

    // --- 2. Each review page → businessUnit JSON (concurrent tabs) ---
    const out: RawLead[] = [];
    let idx = 0;
    let done = 0;
    let blocked = 0;
    // Ctrl+C → save whatever's scraped so far, then exit.
    const onSigint = () => {
      console.log(`\n[Trustpilot] interrupted — saving ${out.length} scraped so far…`);
      try { save?.(out); } catch { /* ignore */ }
      process.exit(0);
    };
    process.on('SIGINT', onSigint);
    const worker = async () => {
      const wp = await tb.newPage();
      while (idx < targets.length) {
        const t = targets[idx++];
        const html = await tb.get(wp, t.url);
        if (html === null) {
          blocked++;
        } else {
          const bu = parseBusinessUnit(html);
          if (bu && bu.displayName) {
            const ci = bu.contactInfo || {};
            const bc = bu.breadcrumb || {};
            const cats = (bu.categories || []).map((c) => c.name).filter(Boolean) as string[];
            const primary = (bu.categories || []).find((c) => c.isPrimary)?.name || cats[0] || null;
            out.push({
              businessName: bu.displayName,
              address: ci.address || null,
              city: ci.city || null,
              state: null,
              zip: ci.zipCode || null,
              phone: ci.phone || null,
              website: bu.websiteUrl || null,
              googleRating: null,
              reviewCount: typeof bu.numberOfReviews === 'number' ? bu.numberOfReviews : null,
              categories: cats,
              yearsInBusiness: null,
              employeeCount: null,
              bbbRating: null,
              bbbAccredited: null,
              source: 'trustpilot' as const,
              sourceUrl: t.url,
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
                region: t.region,
                trustScore: typeof bu.trustScore === 'number' ? bu.trustScore : null,
                reviewCount: typeof bu.numberOfReviews === 'number' ? bu.numberOfReviews : null,
                email: ci.email || null,
                country: ci.country || null,
                category: bc.topLevelDisplayName || null, // group, e.g. "Home & Garden"
                subCategory: bc.midLevelDisplayName || null, // e.g. "Decoration & Interior"
                businessType: bc.bottomLevelDisplayName || primary, // e.g. "Fireplace Store"
                primaryCategory: primary,
                categories: cats.join(', ') || null,
                domain: bu.identifyingName || null,
                isClaimed: bu.isClaimed ?? null,
                isClosed: bu.isClosed ?? null,
              },
            });
          }
        }
        if (++done % 25 === 0) console.log(`[Trustpilot] ${done}/${targets.length} (kept ${out.length}, blocked ${blocked})`);
        if (done % 200 === 0) { try { save?.(out); } catch { /* ignore */ } } // periodic checkpoint
        await sleep(REQ_GAP_MS);
      }
      await wp.close();
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    process.off('SIGINT', onSigint);
    if (blocked) console.warn(`[Trustpilot] ${blocked} review page(s) returned no data.`);

    out.sort((a, b) => {
      const ar = (a.rawData as { region?: string }).region || '';
      const br = (b.rawData as { region?: string }).region || '';
      const as = (a.rawData as { trustScore?: number }).trustScore ?? -1;
      const bs = (b.rawData as { trustScore?: number }).trustScore ?? -1;
      return ar.localeCompare(br) || bs - as || a.businessName.localeCompare(b.businessName);
    });
    console.log(`[Trustpilot] captured: ${out.length}`);
    return out;
  } finally {
    await tb.close();
  }
}
