// ⚠️ LOCAL-ONLY (Phase 1). Imports Playwright and launches a real browser, which
// Vercel CANNOT run. Do NOT import it from the app or wire it into
// lib/pipeline/searchPipeline.ts — that would break the production build. Safe
// only as a standalone script (see scripts/test-investorsclub.ts).
// Production path: port to an Apify actor, then call it from the pipeline.
//
// Runs headless by default. If bot-blocked (0 cards on page 1), re-run HEADED=1.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const LIST_URL = 'https://investors.club/listings/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const DETAIL_CONCURRENCY = 5;

function parseMoney(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\$?\s*([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function parseFloatish(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

interface ICCard {
  name: string;
  url: string;
  category: string;
  badge: string;
  price: string;
  industry: string;
  netProfit: string;
  profitMultiple: string;
  established: string;
  monetization: string;
}

export async function scrapeInvestorsClub(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });

    // --- 1. Crawl list pages (/listings/, /listings/page/2/ …) ---
    const listPage = await context.newPage();
    await listPage.addInitScript(SHIM);
    const cards: ICCard[] = [];
    for (let p = 1; p <= 15; p++) {
      const url = p === 1 ? LIST_URL : `${LIST_URL}page/${p}/`;
      await listPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await listPage.waitForSelector('.items-lstng', { timeout: 20000 }).catch(() => {});

      const batch: ICCard[] = await listPage.evaluate(() => {
        const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
        const out: ICCard[] = [];
        document.querySelectorAll('.items-lstng').forEach((el) => {
          const card = el as HTMLElement;
          const titleEl = card.querySelector('h3.listing-title a') as HTMLAnchorElement | null;
          const name = norm(titleEl?.textContent);
          if (!name) return;

          const details: Record<string, string> = {};
          card.querySelectorAll('.listing-detail-item').forEach((it) => {
            const label = norm(it.querySelector('strong')?.textContent);
            const value = norm(it.querySelector('.tax-values')?.textContent);
            if (label) details[label] = value;
          });

          out.push({
            name,
            url: titleEl?.href || '',
            category: norm(card.querySelector('.category-tag')?.textContent),
            badge: norm(card.querySelector('.listing-category-badge')?.textContent),
            price: norm(card.querySelector('.listing-price')?.textContent).replace(/asking price/i, '').trim(),
            industry: details['Industry'] || '',
            netProfit: details['Annual Net Profit'] || '',
            profitMultiple: details['Profit Multiple'] || '',
            established: details['Established'] || '',
            monetization: details['Monetization'] || '',
          });
        });
        return out;
      });

      if (batch.length === 0) break;
      cards.push(...batch);
      console.log(`[InvestorsClub] list page ${p}: ${batch.length} cards (total ${cards.length})`);
    }
    await listPage.close();

    const byUrl = new Map<string, ICCard>();
    for (const c of cards) if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
    const list = Array.from(byUrl.values());
    console.log(`[InvestorsClub] unique listings: ${list.length}. Fetching detail pages…`);

    // --- 2. Enrich each from its detail page: Gross Revenue + Revenue Multiple ---
    const details = new Map<string, { grossRevenue: string; revenueMultiple: string }>();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        try {
          await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('text=Annual Gross Revenue', { timeout: 20000 }).catch(() => {});
          const text = await page.evaluate(() => document.body.innerText);
          details.set(c.url, {
            grossRevenue: (text.match(/Annual Gross Revenue\s*\$?\s*([\d,]+)/i) || [])[1] || '',
            revenueMultiple: (text.match(/Revenue Multiple\s*([\d.]+)/i) || [])[1] || '',
          });
        } catch (e) {
          console.error(`[InvestorsClub] detail failed: ${c.url} — ${(e as Error).message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[InvestorsClub] details fetched: ${details.size}/${list.length}`);

    const thisYear = new Date().getFullYear();
    return list.map((c) => {
      const d = details.get(c.url);
      const year = c.established ? parseInt(c.established, 10) : null;
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [c.category, c.industry].filter(Boolean),
        yearsInBusiness: year && year > 1900 ? thisYear - year : null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'investorsclub' as const,
        sourceUrl: c.url || LIST_URL,
        mrr: null,
        askingPrice: parseMoney(c.price),
        revenueMultiple: parseFloatish(d?.revenueMultiple),
        profitMultiple: parseFloatish(c.profitMultiple),
        annualRevenue: parseMoney(d?.grossRevenue),
        annualProfit: parseMoney(c.netProfit),
        forSale: true, // listings page only shows active listings
        founderName: null,
        foundedDate: c.established || null,
        rawData: { ...c, ...d },
      };
    });
  } finally {
    await browser.close();
  }
}
