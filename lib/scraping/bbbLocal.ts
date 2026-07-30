// ⚠️ LOCAL-ONLY (Phase 1). Headed Playwright (BBB is Cloudflare-protected).
// Separate from the app's bbb.ts (Apify) — this is the local Excel scraper.
// See scripts/test-bbb.ts.
//
// bbb.org — search is open/SSR, but profile pages are Cloudflare-gated, so we drive
// a real browser: load the search (find_text + find_loc), collect the profile URLs,
// then visit each profile (passing Cloudflare) and parse the rich fields — owner/
// management names, entity type, years in business, website, categories, etc.
//   Configure the search with env vars (then re-run):
//     BBB_TEXT="MSP"  BBB_LOC="California City, CA"   (defaults)
//   BBB_LIMIT=N caps how many profiles to open (default: all found).

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { RawLead, SearchCriteria } from '@/lib/types';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const limitFromEnv = (): number => {
  if (process.env.BBB_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.BBB_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

interface Detail {
  name: string;
  category: string;
  accredited: string;
  rating: string;
  years: string;
  entity: string;
  started: string;
  incorporated: string;
  fileOpened: string;
  alternateNames: string;
  management: string;
  principalContacts: string;
  about: string;
  products: string;
  phone: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  categories: string;
  social: string;
}

export async function scrapeBbbLocal(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const text = process.env.BBB_TEXT || 'MSP';
  const loc = process.env.BBB_LOC || 'California City, CA';
  const limit = limitFromEnv();
  const searchUrl = `https://www.bbb.org/search?find_text=${encodeURIComponent(text)}&find_loc=${encodeURIComponent(loc)}&find_country=USA`;
  console.log(`[BBB] search: "${text}" near "${loc}"`);

  // Use the real installed Chrome (channel: 'chrome') + hide automation flags —
  // BBB's profile pages run a Cloudflare challenge that blocks bundled/automated
  // Chromium ("Just a moment…" forever). Real Chrome + these tweaks pass it.
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    // (1) __name shim so page.evaluate'd functions don't throw; (2) spoof
    // navigator.webdriver so Cloudflare doesn't flag the browser as automated.
    await context.addInitScript({
      content:
        'globalThis.__name=globalThis.__name||function(f){return f};' +
        'Object.defineProperty(navigator,"webdriver",{get:()=>undefined});',
    });
    const page = await context.newPage();

    // --- 1. Search -> profile URLs (browser clears Cloudflare) ---
    // Walk every search page (?page=N), collecting unique profile URLs, until a
    // page adds nothing new (or we hit the limit). BBB paginates the results.
    const uniq = new Set<string>();
    for (let p = 1; p <= 60 && uniq.size < limit; p++) {
      await page.goto(`${searchUrl}&page=${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await page.waitForSelector('a[href*="/profile/"]', { timeout: 40000 }).catch(() => {});
      for (let s = 0; s < 4; s++) {
        await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
        await page.waitForTimeout(400);
      }
      const raw: string[] = await page.$$eval('a[href*="/profile/"]', (els) =>
        els
          .map((e) => (e as HTMLAnchorElement).href)
          .filter((h) => /\/profile\/[a-z0-9-]+\/[a-z0-9-]+-\d+-\d+/i.test(h))
          .map((h) => h.split('?')[0].replace(/\/(addressId|address)\/.*$/, '')),
      );
      const before = uniq.size;
      raw.forEach((u) => uniq.add(u));
      console.log(`[BBB] search page ${p}: +${uniq.size - before} new (total ${uniq.size})`);
      if (uniq.size === before) break; // no new results -> last page reached
    }
    // BBB lists the same business under several profile URLs (different locations/
    // categories). De-dup by the name part of the slug (…/<name>-<id>[-<id>]) so we
    // don't fetch the same business many times.
    const byName = new Map<string, string>();
    for (const u of uniq) {
      const m = u.match(/\/profile\/[^/]+\/(.+?)-\d+(?:-\d+)?\/?$/);
      const key = (m ? m[1] : u).toLowerCase();
      if (!byName.has(key)) byName.set(key, u);
    }
    const targets = Array.from(byName.values()).slice(0, limit === Infinity ? byName.size : limit);
    console.log(`[BBB] unique profiles: ${targets.length} (from ${uniq.size} listings); opening…`);

    // --- 2. Each profile (passes Cloudflare, parse rich fields) ---
    const extract = (): Detail => {
      const txt = document.body.innerText;
      const g = (re: RegExp) => {
        const m = txt.match(re);
        return m ? m[1].replace(/\s+/g, ' ').trim() : '';
      };
      // people under a label (e.g. "Business Management") = "Name, Title" lines,
      // skipping section headers like "Additional Contact"/"Customer Contacts".
      const peopleAfter = (label: string) => {
        const m = txt.match(new RegExp(label + ':?\\s*\\n([\\s\\S]*?)\\n\\s*\\n'));
        if (!m) return '';
        return m[1]
          .split('\n')
          .map((s) => s.trim())
          .filter((l) => l && /,/.test(l) && !/^(Additional|Customer|Business|Email|Phone|Fax|Contact)/i.test(l))
          .slice(0, 6)
          .join('; ');
      };
      // JSON-LD LocalBusiness for address/phone/website
      let ld: Record<string, unknown> = {};
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          const d = JSON.parse(s.textContent || '');
          (Array.isArray(d) ? d : [d]).forEach((o) => {
            if (/LocalBusiness|Organization/.test(JSON.stringify(o?.['@type'] || ''))) ld = o;
          });
        } catch {
          /* ignore */
        }
      });
      const addr = (ld.address || {}) as Record<string, string>;
      // real business website = the "Visit Website" anchor (NOT the bbb.org profile/JSON-LD url)
      let website = '';
      document.querySelectorAll('a').forEach((a) => {
        if (!website && /^\s*Visit Website\s*$/i.test(a.textContent || '')) website = (a as HTMLAnchorElement).href;
      });
      if (/bbb\.org/i.test(website)) website = '';
      // business socials = anchors whose text is exactly the platform name (excludes
      // BBB's own footer socials and the "share this page" link).
      const SOC = /^(facebook|instagram|linkedin|twitter|x|youtube)$/i;
      const social = Array.from(document.querySelectorAll('a'))
        .filter(
          (a) =>
            SOC.test((a.textContent || '').trim()) &&
            !/bbb\.org|share\.php|sharer|intent\/tweet|betterbusinessbureau|bbb_us/i.test((a as HTMLAnchorElement).href),
        )
        .map((a) => (a as HTMLAnchorElement).href);
      const cats = Array.from(document.querySelectorAll('a'))
        .filter((a) => /\/category\//i.test((a as HTMLAnchorElement).href))
        .map((a) => (a.textContent || '').trim())
        .filter(Boolean);
      return {
        // business name lives in <title> ("Name | BBB Business Profile | BBB"); h1 is "About"
        name: ((document.title.split('|')[0] || '') || document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim(),
        category: g(/BUSINESS PROFILE\s*\n([^\n]+)/),
        accredited: /is NOT\s+BBB Accredited/i.test(txt) ? 'No' : /(BBB Accredited Business|is BBB Accredited)/i.test(txt) ? 'Yes' : '',
        rating: g(/BBB Rating\s*\n?\s*([A-F][+-]?)\b/),
        years: g(/Years in Business:\s*(\d+)/),
        entity: g(/Type of Entity:\s*([^\n]+)/),
        started: g(/Business Started:\s*([^\n]+)/),
        incorporated: g(/Business Incorporated:\s*([^\n]+)/),
        fileOpened: g(/BBB File Opened:\s*([^\n]+)/),
        alternateNames: g(/Alternate Names:\s*\n?([^\n]+)/),
        management: peopleAfter('Business Management'),
        principalContacts: peopleAfter('Principal Contacts'),
        about: g(/About This Business\s*\n([\s\S]*?)\n\s*\n/),
        products: g(/Products and Services\s*\n([\s\S]*?)\n\s*\n/),
        phone: (document.querySelector('a[href^="tel:"]')?.getAttribute('href') || '').replace('tel:', ''),
        website,
        street: addr.streetAddress || '',
        city: addr.addressLocality || '',
        state: addr.addressRegion || '',
        zip: addr.postalCode || '',
        categories: Array.from(new Set(cats)).join(', '),
        social: Array.from(new Set(social)).join(', '),
      };
    };

    const out: RawLead[] = [];
    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // wait for Cloudflare's "Just a moment…" to clear and the real profile to render
        await page
          .waitForFunction(
            () => !/just a moment|attention required|checking your browser/i.test(document.title) &&
              /BBB Rating|Years in Business|Type of Entity|About This Business/.test(document.body.innerText),
            { timeout: 45000 },
          )
          .catch(() => {});
        if (i === 0) {
          writeFileSync('bbb-profile-debug.html', await page.content());
          console.log(`[BBB] debug: url=${page.url()} | title="${await page.title()}" | saved bbb-profile-debug.html`);
        }
        const d = (await page.evaluate(extract)) as Detail;
        if (!d.name) continue;
        const owner = (d.management || d.principalContacts).split(';')[0]?.trim() || '';
        out.push({
          businessName: d.name,
          address: d.street || null,
          city: d.city || null,
          state: d.state || null,
          zip: d.zip || null,
          phone: d.phone || null,
          website: d.website || null,
          googleRating: null,
          reviewCount: null,
          categories: d.categories ? d.categories.split(', ') : d.category ? [d.category] : [],
          yearsInBusiness: d.years ? parseInt(d.years, 10) : null,
          employeeCount: null,
          bbbRating: d.rating || null,
          bbbAccredited: d.accredited === 'Yes' ? true : d.accredited === 'No' ? false : null,
          source: 'bbb' as const,
          sourceUrl: url,
          mrr: null,
          askingPrice: null,
          revenueMultiple: null,
          profitMultiple: null,
          annualRevenue: null,
          annualProfit: null,
          forSale: null,
          founderName: owner.replace(/,.*$/, '').replace(/^(Mr\.|Ms\.|Mrs\.)\s*/i, '') || null,
          foundedDate: d.started || null,
          rawData: {
            category: d.category || null,
            entityType: d.entity || null,
            businessStarted: d.started || null,
            businessIncorporated: d.incorporated || null,
            bbbFileOpened: d.fileOpened || null,
            alternateNames: d.alternateNames || null,
            management: d.management || null,
            principalContacts: d.principalContacts || null,
            about: d.about || null,
            products: d.products || null,
            categories: d.categories || null,
            social: d.social || null,
          },
        });
        console.log(`[BBB] ${i + 1}/${targets.length}: ${d.name}`);
      } catch (e) {
        console.error(`[BBB] failed: ${url} — ${(e as Error).message}`);
      }
      await page.waitForTimeout(800); // be gentle with Cloudflare
    }
    // final guarantee: one row per unique business name
    const seen = new Set<string>();
    const unique = out.filter((l) => {
      const k = (l.businessName || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    console.log(`[BBB] captured: ${out.length}; unique businesses: ${unique.length}`);
    return unique;
  } finally {
    await browser.close();
  }
}
