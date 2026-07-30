// ⚠️ LOCAL-ONLY (Phase 1). Headed Playwright — the FREE alternative to the Apify
// googleMaps.ts (compass/crawler-google-places). Same output shape (RawLead,
// source: 'google_maps'), no APIFY_API_TOKEN, no per-result cost.
// See scripts/test-googlemaps-local.ts.
//
// maps.google.com — we drive a real browser: open the search results feed, scroll
// it to load every place card, collect the /maps/place/ URLs, then visit each place
// and parse name / address / phone / website / rating / reviews / category from the
// (stable) data-item-id + aria-label attributes.
//   Configure via function args (the test runner loops cities) or env vars:
//     GM_QUERY="Steel supplier"  GM_LOC="Mandi Gobindgarh, Punjab"
//   GM_LIMIT=N caps places opened per search (default 60).

import { chromium, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { RawLead } from '@/lib/types';

// Google throws its "/sorry/" CAPTCHA when we load pages too fast. Because we run
// headed, the user can solve it by hand — so when we detect it we PAUSE and poll
// until the page leaves /sorry/ (Google then redirects to the `continue=` target),
// up to ~5 min. Returns true if we were blocked (and are now resumed).
async function waitIfBlocked(page: Page): Promise<boolean> {
  const blocked = () => /\/sorry\/|\/recaptcha|unusual traffic/i.test(page.url());
  if (!blocked()) return false;
  console.log('\n⚠️  Google CAPTCHA detected — solve it in the open Chrome window. Waiting…');
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(3000);
    if (!blocked()) {
      console.log('✓ CAPTCHA cleared — resuming.\n');
      await page.waitForTimeout(1500);
      return true;
    }
  }
  console.log('…still blocked after 5 min; continuing anyway (results may be incomplete).');
  return true;
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_LIMIT = 60;

const limitFromEnv = (): number => {
  if (process.env.GM_LIMIT === undefined) return DEFAULT_LIMIT;
  const n = parseInt(process.env.GM_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
};

export interface GoogleMapsLocalOpts {
  query?: string;
  /** Free-text location appended to the query, e.g. "Mandi Gobindgarh, Punjab". */
  location?: string;
  /** Stamped onto each lead's city/state when the Maps address doesn't yield them. */
  city?: string;
  state?: string;
  limit?: number;
  /** Case-insensitive regex source; keep only leads whose name or category matches
   *  (drops off-topic results Google mixes into the long tail). Falls back to the
   *  GM_MUST_MATCH env var. Empty = keep everything. */
  mustMatch?: string;
  /** Case-insensitive regex source; DROP leads whose name or category matches
   *  (e.g. exclude "dealer|trader|retail|distributor" to keep manufacturers only).
   *  Falls back to the GM_EXCLUDE env var. Applied after mustMatch. */
  exclude?: string;
  /** Like mustMatch but tested ONLY against the business's Google Maps category
   *  (its "type"), not its name — e.g. keep type "Steel manufacturer" / "Manufacturer"
   *  / "Steel fabricator". Falls back to GM_CAT_MATCH. */
  catMatch?: string;
  /** Like exclude but tested ONLY against the category — e.g. drop "Steel distributor"
   *  / "Iron & steel store". Falls back to GM_CAT_EXCLUDE. */
  catExclude?: string;
  /** Called with this city's leads-so-far every few places, so the caller can
   *  save incrementally and never lose progress on a CAPTCHA/crash/Ctrl+C. */
  onProgress?: (leadsSoFar: RawLead[]) => void;
}

interface PlaceDetail {
  name: string;
  rating: number | null;
  reviews: number | null;
  address: string;
  phone: string;
  website: string;
  category: string;
}

// Runs in the page. Reads the place panel via data-item-id / aria-label, which are
// far more stable than Google's obfuscated CSS class names.
function extractPlace(): PlaceDetail {
  const q = (sel: string) => document.querySelector(sel);
  const name = (q('h1')?.textContent || '').replace(/\s+/g, ' ').trim();

  let rating: number | null = null;
  let reviews: number | null = null;
  const f7 = q('div.F7nice');
  if (f7) {
    const t = f7.textContent || '';
    const rm = t.match(/([\d.]+)/);
    if (rm) rating = parseFloat(rm[1]);
    const cm = t.match(/\(([\d,]+)\)/) || t.match(/([\d,]+)\s*review/i);
    if (cm) reviews = parseInt(cm[1].replace(/,/g, ''), 10);
  }

  // aria-label reads "Address: 123 Main St" / "Phone: +91 ..." — strip the label.
  const itemLabel = (sel: string) => {
    const el = q(sel);
    if (!el) return '';
    return (el.getAttribute('aria-label') || '').replace(/^[^:]*:\s*/, '').trim();
  };
  const address = itemLabel('button[data-item-id="address"]');
  const phone = itemLabel('button[data-item-id^="phone"]');

  const authority = q('a[data-item-id="authority"]') as HTMLAnchorElement | null;
  const website = authority?.href || '';

  let category = '';
  const catBtn = q('button[jsaction*="category"]');
  if (catBtn) category = (catBtn.textContent || '').replace(/\s+/g, ' ').trim();

  return { name, rating, reviews, address, phone, website, category };
}

export async function scrapeGoogleMapsLocal(opts?: GoogleMapsLocalOpts): Promise<RawLead[]> {
  const query = opts?.query || process.env.GM_QUERY || 'Plumbing';
  const location = opts?.location ?? process.env.GM_LOC ?? '';
  const limit = opts?.limit ?? limitFromEnv();
  const term = location ? `${query} ${location}` : query;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(term)}?hl=en`;
  const mustMatchSrc = opts?.mustMatch ?? process.env.GM_MUST_MATCH ?? '';
  const matchRe = mustMatchSrc ? new RegExp(mustMatchSrc, 'i') : null;
  const excludeSrc = opts?.exclude ?? process.env.GM_EXCLUDE ?? '';
  const excludeRe = excludeSrc ? new RegExp(excludeSrc, 'i') : null;
  const catMatchSrc = opts?.catMatch ?? process.env.GM_CAT_MATCH ?? '';
  const catMatchRe = catMatchSrc ? new RegExp(catMatchSrc, 'i') : null;
  const catExcludeSrc = opts?.catExclude ?? process.env.GM_CAT_EXCLUDE ?? '';
  const catExcludeRe = catExcludeSrc ? new RegExp(catExcludeSrc, 'i') : null;
  console.log(
    `[GMapsLocal] search: "${term}" (limit ${limit}` +
      `${matchRe ? `, keep /${mustMatchSrc}/i` : ''}${excludeRe ? `, drop /${excludeSrc}/i` : ''})`,
  );

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    await context.addInitScript({
      content:
        'globalThis.__name=globalThis.__name||function(f){return f};' +
        'Object.defineProperty(navigator,"webdriver",{get:()=>undefined});',
    });
    const page = await context.newPage();

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitIfBlocked(page);

    // Consent wall (mostly EU, but handle it anyway): click accept/agree and continue.
    if (/consent\.google\.|before you continue/i.test(page.url() + (await page.title().catch(() => '')))) {
      await page
        .getByRole('button', { name: /accept all|i agree|agree to all|reject all/i })
        .first()
        .click({ timeout: 8000 })
        .catch(() => {});
      await page.waitForTimeout(1500);
    }

    const feedSel = 'div[role="feed"]';
    const hasFeed = await page.waitForSelector(feedSel, { timeout: 30000 }).then(() => true).catch(() => false);

    // --- Collect place URLs ---
    const links = new Set<string>();
    if (!hasFeed) {
      // A very specific query can land directly on a single place page (no list).
      if (/\/maps\/place\//.test(page.url())) links.add(page.url());
    } else {
      let stagnant = 0;
      for (let i = 0; i < 40 && links.size < limit; i++) {
        const urls: string[] = await page.$$eval(`${feedSel} a[href*="/maps/place/"]`, (els) =>
          els.map((e) => (e as HTMLAnchorElement).href),
        );
        const before = links.size;
        urls.forEach((u) => links.add(u.split('?')[0]));
        await page.$eval(feedSel, (el) => el.scrollBy(0, el.scrollHeight)).catch(() => {});
        await page.waitForTimeout(1200);
        const reachedEnd = await page.evaluate(() => /reached the end of the list/i.test(document.body.innerText));
        console.log(`[GMapsLocal] scroll ${i + 1}: +${links.size - before} (total ${links.size})`);
        if (reachedEnd) break;
        if (links.size === before) {
          if (++stagnant >= 3) break; // list stopped growing — done
        } else {
          stagnant = 0;
        }
      }
    }

    const targets = Array.from(links).slice(0, limit);
    console.log(`[GMapsLocal] unique places: ${targets.length}; opening…`);

    // --- Visit each place, parse details ---
    const out: RawLead[] = [];
    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // If Google challenged us, pause for the manual solve, then reload the place.
        if (await waitIfBlocked(page)) {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        }
        await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (i === 0) {
          writeFileSync('gmaps-place-debug.html', await page.content());
          console.log(`[GMapsLocal] debug: saved gmaps-place-debug.html`);
        }
        const d = (await page.evaluate(extractPlace)) as PlaceDetail;
        if (!d.name) continue;
        // Strict topical filter: keep only name+category that match, then drop excludes.
        const hay = `${d.name} ${d.category}`;
        if (matchRe && !matchRe.test(hay)) {
          console.log(`[GMapsLocal] ${i + 1}/${targets.length}: skip off-topic — ${d.name} (${d.category})`);
          continue;
        }
        if (excludeRe && excludeRe.test(hay)) {
          console.log(`[GMapsLocal] ${i + 1}/${targets.length}: skip excluded — ${d.name} (${d.category})`);
          continue;
        }
        // Category-only (business "type") filters — independent of the name.
        if (catMatchRe && !catMatchRe.test(d.category)) {
          console.log(`[GMapsLocal] ${i + 1}/${targets.length}: skip type — ${d.name} (${d.category || 'no category'})`);
          continue;
        }
        if (catExcludeRe && catExcludeRe.test(d.category)) {
          console.log(`[GMapsLocal] ${i + 1}/${targets.length}: skip type-excluded — ${d.name} (${d.category})`);
          continue;
        }
        out.push({
          businessName: d.name,
          address: d.address || null,
          city: opts?.city || null,
          state: opts?.state || null,
          zip: (d.address.match(/\b(\d{5,6})\b/) || [])[1] || null,
          phone: d.phone || null,
          website: d.website || null,
          googleRating: d.rating,
          reviewCount: d.reviews,
          categories: d.category ? [d.category] : [],
          yearsInBusiness: null,
          employeeCount: null,
          bbbRating: null,
          bbbAccredited: null,
          source: 'google_maps' as const,
          sourceUrl: url,
          rawData: d,
        });
        console.log(`[GMapsLocal] ${i + 1}/${targets.length}: ${d.name}`);
        if (opts?.onProgress && out.length % 5 === 0) opts.onProgress(out); // periodic save hook
      } catch (e) {
        console.error(`[GMapsLocal] failed: ${url} — ${(e as Error).message}`);
      }
      // Be gentle to avoid Google's rate-limit CAPTCHA: ~1s between places, with a
      // longer breather every 25 to keep the request rate sustainable.
      await page.waitForTimeout(900 + (i % 5) * 120);
      if (i > 0 && i % 25 === 0) {
        console.log('[GMapsLocal] pacing breather…');
        await page.waitForTimeout(5000);
      }
    }

    // one row per unique business name
    const seen = new Set<string>();
    const unique = out.filter((l) => {
      const k = (l.businessName || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    console.log(`[GMapsLocal] captured ${out.length}; unique ${unique.length}`);
    return unique;
  } finally {
    await browser.close();
  }
}
