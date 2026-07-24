// Trustpilot (trustpilot.com) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/trustpilot.ts. Trustpilot is behind AWS WAF; we drive a real
// (headed-under-xvfb) browser that solves the WAF challenge, then read each review
// page's __NEXT_DATA__.businessUnit. Uses Apify's DATACENTER proxy by default
// (free); flip `residential` for residential (paid). Produces local-business leads
// (name, website, rating, address, phone) — NOT a for-sale marketplace, so deal
// fields stay empty. NOTE: the local version used channel:'chrome'; the Apify image
// ships Chromium only, so we use the bundled browser + anti-automation flags.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const DEFAULT_CATEGORIES = [
  'home_garden', 'home_services', 'construction_manufacturing',
  'vehicles_transportation', 'utilities', 'electronics_technology',
];
const HOSTS = [
  { host: 'ca.trustpilot.com', region: 'CA' },
  { host: 'www.trustpilot.com', region: 'US' },
];
const REQ_GAP_MS = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseBusinessUnit(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.props?.pageProps?.businessUnit || null;
  } catch {
    return null;
  }
}
const categoryCount = (html) =>
  parseInt(((html.match(/Companies\s*\(([\d,]+)\)/i) || [])[1] || '0').replace(/,/g, ''), 10) || 0;

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;
  const categories = Array.isArray(input.categories) && input.categories.length ? input.categories : DEFAULT_CATEGORIES;

  const proxyConfiguration = await Actor.createProxyConfiguration(
    input.residential ? { groups: ['RESIDENTIAL'], countryCode: 'US' } : undefined,
  );
  let proxy;
  if (proxyConfiguration) {
    const u = new URL(await proxyConfiguration.newUrl());
    proxy = { server: `${u.protocol}//${u.hostname}:${u.port}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    console.log(`[Trustpilot] using ${input.residential ? 'RESIDENTIAL' : 'datacenter'} proxy`);
  }

  const browser = await chromium.launch({
    headless: false,
    proxy,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const out = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addInitScript({
      content:
        'globalThis.__name=globalThis.__name||function(f){return f};' +
        'Object.defineProperty(navigator,"webdriver",{get:()=>undefined});',
    });

    const waitReal = (page) =>
      page.waitForFunction(
        () => !/Verifying your connection/i.test(document.title) &&
          (!!document.getElementById('__NEXT_DATA__') || /Companies\s*\(/.test(document.body.innerText || '')),
        { timeout: 45000 },
      );
    const get = async (page, url) => {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitReal(page);
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
    };

    // Prime the WAF challenge once up front.
    const primer = await context.newPage();
    await primer.goto('https://www.trustpilot.com/categories', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await waitReal(primer).catch(() => {});
    await primer.close();

    // --- 1. Enumerate /review/<domain> URLs until maxItems total ---
    const targets = [];
    const seen = new Set();
    const ep = await context.newPage();
    for (const { host, region } of HOSTS) {
      if (targets.length >= maxItems) break;
      for (const cat of categories) {
        if (targets.length >= maxItems) break;
        for (let p = 1; p <= 80 && targets.length < maxItems; p++) {
          const url = `https://${host}/categories/${cat}${p === 1 ? '' : `?page=${p}`}`;
          const html = await get(ep, url);
          if (html === null) break;
          const links = Array.from(html.matchAll(/href="(\/review\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,})"/gi)).map((mm) => mm[1]);
          let added = 0;
          for (const rel of links) {
            if (targets.length >= maxItems) break;
            const key = `${region}:${rel}`;
            if (!seen.has(key)) { seen.add(key); targets.push({ url: `https://${host}${rel}`, region }); added++; }
          }
          if (added === 0) break;
          await sleep(REQ_GAP_MS);
        }
      }
    }
    await ep.close();
    console.log(`[Trustpilot] companies to fetch: ${targets.length}…`);

    // --- 2. Each review page → businessUnit JSON ---
    const wp = await context.newPage();
    for (const t of targets) {
      const html = await get(wp, t.url);
      if (!html) continue;
      const bu = parseBusinessUnit(html);
      if (!bu || !bu.displayName) continue;
      const ci = bu.contactInfo || {};
      const bc = bu.breadcrumb || {};
      const cats = (bu.categories || []).map((c) => c.name).filter(Boolean);
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
        source: 'trustpilot',
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
          category: bc.topLevelDisplayName || null,
          subCategory: bc.midLevelDisplayName || null,
          businessType: bc.bottomLevelDisplayName || primary,
          primaryCategory: primary,
          categories: cats.join(', ') || null,
          domain: bu.identifyingName || null,
          isClaimed: bu.isClaimed ?? null,
          isClosed: bu.isClosed ?? null,
        },
      });
      await sleep(REQ_GAP_MS);
    }
    await wp.close();
  } finally {
    await browser.close();
  }

  if (out.length === 0) {
    console.log('[Trustpilot] 0 companies — AWS WAF likely blocked the datacenter IP. Try residential.');
  }
  console.log(`[Trustpilot] captured: ${out.length}`);
  await Actor.pushData(out);
  console.log(`[Trustpilot] pushed ${out.length} leads to the dataset`);
} catch (err) {
  console.error('[Trustpilot] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
