// Tobuz (tobuz.com) — self-owned Apify actor (Phase 4).
// Ports lib/scraping/tobuz.ts. Behind Cloudflare, so runs a HEADED browser (under
// xvfb) through Apify's DATACENTER proxy to try clearing it for free; flip the
// `residential` input to use residential (paid) if datacenter is blocked.
// MULTI-CURRENCY (AED/USD/INR/SAR/…): each listing carries its own currency.
import { Actor } from 'apify';
import { chromium } from 'playwright';

const BASE = 'https://tobuz.com/business/business-for-sale-investment-opportunities';
const SITE = 'https://tobuz.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DETAIL_CONCURRENCY = 5;

const priceDisplay = (n, currency) => {
  if (n == null || !currency) return null;
  try {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('en-US')}`;
  }
};

const clean = (s) =>
  s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;|&rsquo;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

const CURRENCIES = ['AED', 'USD', 'INR', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'GBP', 'EUR', 'PKR'];
function parsePrice(raw) {
  if (!raw) return { amount: null, currency: null };
  const cur = CURRENCIES.find((c) => raw.toUpperCase().includes(c)) || (/₹/.test(raw) ? 'INR' : /\$/.test(raw) ? 'USD' : null);
  const m = raw.replace(/,/g, '').match(/([\d.]+)/);
  return { amount: m ? Math.round(parseFloat(m[1])) : null, currency: cur };
}

function section(html, label) {
  const re = new RegExp(`business-description[^>]*>\\s*${label}\\s*</span>\\s*<br\\s*/?>([\\s\\S]*?)</p>`, 'i');
  const m = html.match(re);
  return m ? clean(m[1]) : '';
}
function sectionLinks(html, label) {
  const re = new RegExp(`business-description[^>]*>\\s*${label}\\s*</span>([\\s\\S]*?)</p>`, 'i');
  const m = html.match(re);
  if (!m) return '';
  return Array.from(m[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)).map((x) => clean(x[1])).filter(Boolean).join(', ');
}
function parseDetail(html) {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
  const table = {};
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

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const maxItems = Number(input.maxItems) > 0 ? Number(input.maxItems) : 50;

  const proxyConfiguration = await Actor.createProxyConfiguration(
    input.residential ? { groups: ['RESIDENTIAL'], countryCode: 'US' } : undefined,
  );
  let proxy;
  if (proxyConfiguration) {
    const u = new URL(await proxyConfiguration.newUrl());
    proxy = { server: `${u.protocol}//${u.hostname}:${u.port}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    console.log(`[Tobuz] using ${input.residential ? 'RESIDENTIAL' : 'datacenter'} proxy`);
  }

  const browser = await chromium.launch({ headless: false, proxy });
  let items = [];
  const details = new Map();
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // --- 1. Enumerate id+slug per list page (browser clears Cloudflare) ---
    const seen = new Set();
    for (let p = 1; items.length < maxItems; p++) {
      const url = p === 1 ? BASE : `${BASE}/${p}?layout=grid`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await page.waitForFunction(() => /contact_business2\(\d+/.test(document.body.innerHTML), { timeout: 45000 }).catch(() => {});
      const pairs = await page.evaluate(() => {
        const out = [];
        const re = /contact_business2\((\d+),'([^']*)'/g;
        let m;
        while ((m = re.exec(document.body.innerHTML))) out.push({ id: m[1], slug: m[2] });
        return out;
      });
      let fresh = 0;
      for (const it of pairs) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(it);
        fresh++;
        if (items.length >= maxItems) break;
      }
      console.log(`[Tobuz] page ${p}: +${fresh} (total ${items.length})`);
      if (fresh === 0) break;
    }
    console.log(`[Tobuz] listings: ${items.length}. Fetching detail pages…`);

    // --- 2. Detail pages via the browser context (carries CF clearance) ---
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const it = items[idx++];
        const url = `${SITE}/business/${it.slug}/L-${it.id}`;
        try {
          const res = await context.request.get(url, { timeout: 30000 });
          if (res.ok()) details.set(it.id, parseDetail(await res.text()));
        } catch { /* skip */ }
      }
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[Tobuz] details fetched: ${details.size}/${items.length}`);
  } finally {
    await browser.close();
  }

  if (items.length === 0) {
    console.log('[Tobuz] 0 listings — Cloudflare likely blocked the datacenter IP. Try residential.');
  }

  const thisYear = new Date().getFullYear();
  const leads = items.map((it) => {
    const d = details.get(it.id);
    const t = d?.table ?? {};
    const { amount, currency } = parsePrice(d?.price || '');
    const [city, country] = (d?.location || '').split(',').map((s) => s.trim());
    const yearEst = parseInt(t['Year of Establishment'] || '', 10);
    const yearsTrading = parseInt(t['No of Years trading'] || '', 10);
    const employees = parseInt(t['No of Employee'] || '', 10);
    return {
      businessName: d?.title || it.slug.replace(/-/g, ' '),
      address: null, city: city || null, state: null, zip: null, phone: null, website: null,
      googleRating: null, reviewCount: null,
      categories: [d?.category, d?.subCategory].filter(Boolean),
      yearsInBusiness: Number.isFinite(yearsTrading) ? yearsTrading
        : Number.isFinite(yearEst) && yearEst > 1900 ? thisYear - yearEst : null,
      employeeCount: Number.isFinite(employees) ? employees : null,
      bbbRating: null, bbbAccredited: null,
      source: 'tobuz',
      sourceUrl: `${SITE}/business/${it.slug}/L-${it.id}`,
      currency: currency,
      priceDisplay: priceDisplay(amount, currency),
      mrr: null,
      askingPrice: amount, // mixed currency — see currency field
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: null,
      annualProfit: null,
      forSale: true,
      founderName: null,
      foundedDate: t['Year of Establishment'] || null,
      rawData: {
        currency, priceRaw: d?.price || null, subtitle: d?.subtitle || null, listingType: d?.listingType || null,
        posted: d?.posted || null, location: d?.location || null, country: country || null,
        category: d?.category || null, subCategory: d?.subCategory || null, features: d?.features || null,
        keywords: d?.keywords || null, yearEstablished: t['Year of Establishment'] || null,
        yearsTrading: t['No of Years trading'] || null, employees: t['No of Employee'] || null,
        companyType: t['Type'] || null, status: t['Status'] || null, description: d?.description || null,
      },
    };
  });

  await Actor.pushData(leads);
  console.log(`[Tobuz] pushed ${leads.length} leads to the dataset`);
} catch (err) {
  console.error('[Tobuz] run failed:', err);
  throw err;
} finally {
  await Actor.exit();
}
