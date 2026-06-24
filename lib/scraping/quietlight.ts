// ⚠️ LOCAL-ONLY (Phase 1). Imports Playwright and launches a real browser, which
// Vercel CANNOT run. Do NOT import it from the app or wire it into
// lib/pipeline/searchPipeline.ts — that would break the production build. Safe
// only as a standalone script (see scripts/test-quietlight.ts).
//
// NOTE: Quiet Light sits behind Cloudflare's "Just a moment" bot check, so this
// runs HEADED (a browser window opens) to clear it. The production path (Apify)
// would use Apify's anti-blocking / residential proxies instead.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const LISTINGS_URL = 'https://quietlight.com/listings/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// "$10,950,000", "Accepting Offers" -> number | null
function parseMoney(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\$?\s*([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

interface QLCard {
  title: string;
  status: string;        // Available | Under Offer | Recently Sold
  category: string;
  price: string;         // "$10,950,000" | "Accepting Offers"
  revenue: string;       // raw integer string from data-revenue
  income: string;        // raw integer string from data-income (SDE/profit)
  multiple: string;      // parsed from title if present, e.g. "3.8"
  url: string | null;
}

export async function scrapeQuietLight(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' });
    await page.goto(LISTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait for Cloudflare to clear and the cards to render.
    await page.waitForSelector('.listing-card', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const cards: QLCard[] = await page.evaluate(() => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const CATS: Record<string, string> = {
        'amazon-fba': 'Amazon FBA',
        ecommerce: 'Ecommerce',
        'saas-software': 'SaaS',
        'content-site': 'Content',
        'membership-coaching': 'Membership',
        sba: 'SBA Pre-Qualified',
        other: 'Other',
      };
      const out: QLCard[] = [];

      document.querySelectorAll('.listing-card').forEach((el) => {
        const card = el as HTMLElement;
        const title = norm(card.querySelector('.listing-card__title')?.textContent);
        if (!title) return;

        const cls = card.className;
        const status = /\bsold\b/.test(cls)
          ? 'Recently Sold'
          : /under-loi|under-offer/.test(cls)
            ? 'Under Offer'
            : 'Available';

        // Category: prefer the visible label, else map from the card's class.
        let category = norm(card.querySelector('.listing-card__category')?.textContent);
        if (!category) {
          const key = Object.keys(CATS).find((k) => cls.split(/\s+/).includes(k));
          category = key ? CATS[key] : '';
        }

        const link = card.querySelector('a[href*="/listings/"]') as HTMLAnchorElement | null;
        const mult = title.match(/([\d.]+)\s*x\b/i);

        out.push({
          title,
          status,
          category,
          price: norm(card.querySelector('.listing-card__price')?.textContent),
          revenue: card.querySelector('[data-revenue]')?.getAttribute('data-revenue') || '',
          income: card.querySelector('[data-income]')?.getAttribute('data-income') || '',
          multiple: mult ? mult[1] : '',
          url: link ? link.href : null,
        });
      });
      return out;
    });

    await page.close();

    // De-dupe by listing URL (the grid can render duplicates across filters).
    const byUrl = new Map<string, QLCard>();
    for (const c of cards) {
      const key = c.url || c.title;
      if (!byUrl.has(key)) byUrl.set(key, c);
    }
    const unique = Array.from(byUrl.values());
    console.log(`[QuietLight] listings parsed: ${unique.length}`);

    return unique.map((c) => ({
      businessName: c.title,
      address: null, city: null, state: null, zip: null, phone: null, website: null,
      googleRating: null, reviewCount: null,
      categories: c.category ? [c.category] : [],
      yearsInBusiness: null, employeeCount: null,
      bbbRating: null, bbbAccredited: null,
      source: 'quietlight' as const,
      sourceUrl: c.url ?? LISTINGS_URL,
      mrr: null,
      askingPrice: /accepting offers/i.test(c.price) ? null : parseMoney(c.price),
      revenueMultiple: c.multiple ? parseFloat(c.multiple) : null,
      profitMultiple: null,
      annualRevenue: c.revenue ? parseInt(c.revenue, 10) : null,
      annualProfit: c.income ? parseInt(c.income, 10) : null, // QL "Income" = SDE/profit
      forSale: c.status !== 'Recently Sold',
      founderName: null,
      foundedDate: null,
      rawData: c, // keeps status, price label, multiple
    }));
  } finally {
    await browser.close();
  }
}
