// ⚠️ LOCAL-ONLY (Phase 1). This module imports Playwright and launches a real
// browser, which Vercel CANNOT bundle/run. Do NOT import it from the app or wire
// it into lib/pipeline/searchPipeline.ts — that would break the production build.
// It is safe only as a standalone script (see scripts/test-apppeak.ts).
// Production path: port this scraping logic to an Apify actor, then call that
// actor from the pipeline via ApifyClient (like manta/yellowpages).

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

// AppPeak (listings.apppeak.com/listings) — a PUBLIC board of micro-SaaS / mobile
// apps for sale. No login needed for the listing cards (only the "dataroom" is
// gated behind buyer registration, which we don't need). Each card carries the
// full deal signal: asking price, revenue/profit multiples, annual revenue/profit,
// rating, downloads, category, platforms.
const LISTINGS_URL = 'https://listings.apppeak.com/listings';

// "$180,000", "$43,346", "4,410/mo", "N/A" -> number | null
function parseMoney(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'n/a' || s === '-') return null;
  let mult = 1;
  if (/\bb(illion)?\b/.test(s)) mult = 1e9;
  else if (/\bm(illion)?\b/.test(s)) mult = 1e6;
  else if (/\bk\b/.test(s)) mult = 1e3;
  const m = s.replace(/,/g, '').match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

// "4.2", "8.0 Profit", "4.7/5", "56.5 years" -> leading float | null
function parseFloatish(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

interface AppCard {
  name: string;
  description: string;
  askingPrice: string;
  revenueMultiple: string;
  profitMultiple: string;
  category: string;
  rating: string;
  age: string;
  annualRevenue: string;
  annualProfit: string;
  downloads: string;
  platforms: string[];
  hotDeal: boolean;
  sold: boolean;
  thumbId: string | null;
}

export async function scrapeAppPeak(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // tsx/esbuild wraps named functions with a `__name(...)` helper that doesn't
    // exist in the browser; inject a no-op shim (raw string) before any script runs.
    await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
    await page.goto(LISTINGS_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Asking Price', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Extracts all currently-rendered cards. Defined here and passed to
    // page.evaluate so we can re-run it after each scroll step.
    const extract = () => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const out: AppCard[] = [];

      document.querySelectorAll('h2').forEach((h2) => {
        const name = norm(h2.textContent);
        if (!name) return;

        // The full card is the nearest ancestor that holds the metrics row, i.e.
        // contains "Annual Revenue" (present on all cards). NOTE: price is NOT a
        // reliable anchor — ~28 of 49 listings have no "Asking Price" (offer-only).
        let card: HTMLElement | null = h2.parentElement;
        for (let up = 0; up < 10 && card; up++) {
          if (/Annual Revenue/.test(card.textContent || '')) break;
          card = card.parentElement;
        }
        if (!card || card.querySelectorAll('h2').length !== 1) return;

        const scope = card;
        const cardText = norm(scope.innerText);

        // Generic label -> value: each metric is <span>label</span><span>value</span>.
        const valOf = (label: string) => {
          const nodes = Array.from(scope.querySelectorAll('span'));
          for (const n of nodes) {
            if (norm(n.textContent) === label) return norm(n.nextElementSibling?.textContent);
          }
          return '';
        };

        const mul = cardText.match(/Multiple:\s*([\d.]+)\s*Revenue\s*([\d.]+)\s*Profit/i);
        const desc = norm(scope.querySelector('[class*="line-clamp"]')?.textContent);
        const img = scope.querySelector('img') as HTMLImageElement | null;
        const thumbId = img ? (img.src.match(/preview_img\/(\d+)/) || [])[1] || null : null;

        // Listings show either "Asking Price" (available), "Sold" (already sold),
        // or neither (offer-only). Both labels use the same span->value pattern.
        const soldPrice = valOf('Sold');
        const price = valOf('Asking Price') || soldPrice;

        out.push({
          name,
          description: desc,
          askingPrice: price,
          revenueMultiple: mul ? mul[1] : '',
          profitMultiple: mul ? mul[2] : '',
          category: valOf('Category'),
          rating: valOf('Rating'),
          age: valOf('Age'),
          annualRevenue: valOf('Annual Revenue'),
          annualProfit: valOf('Annual Profit'),
          downloads: valOf('Downloads'),
          platforms: ['iOS', 'Android'].filter((p) => new RegExp(`\\b${p}\\b`).test(cardText)),
          hotDeal: /Hot Deal/.test(cardText),
          sold: !!soldPrice,
          thumbId,
        });
      });
      return out;
    };

    // All listings are server-rendered into the DOM (no lazy loading), so a
    // single extraction gets them all. De-dupe by name defensively.
    const batch = (await page.evaluate(extract)) as AppCard[];
    const byName = new Map<string, AppCard>();
    for (const c of batch) if (c.name && !byName.has(c.name)) byName.set(c.name, c);

    await page.close();
    const cards = Array.from(byName.values());
    console.log(`[AppPeak] listings parsed: ${cards.length}`);

    return cards.map((c) => ({
      businessName: c.name,
      address: null, city: null, state: null, zip: null, phone: null, website: null,
      googleRating: parseFloatish(c.rating), // "4.7/5" -> 4.7
      reviewCount: null,
      categories: [c.category, ...c.platforms].filter(Boolean),
      yearsInBusiness: parseFloatish(c.age), // "56.5 years" -> 56.5
      employeeCount: null,
      bbbRating: null, bbbAccredited: null,
      source: 'apppeak' as const,
      sourceUrl: LISTINGS_URL,
      mrr: null,
      askingPrice: parseMoney(c.askingPrice),
      revenueMultiple: parseFloatish(c.revenueMultiple),
      profitMultiple: parseFloatish(c.profitMultiple),
      annualRevenue: parseMoney(c.annualRevenue),
      annualProfit: parseMoney(c.annualProfit),
      forSale: !c.sold, // a sold listing is no longer for sale
      founderName: null,
      foundedDate: null,
      rawData: c, // keeps downloads, platforms, hotDeal, thumbId
    }));
  } finally {
    await browser.close();
  }
}
