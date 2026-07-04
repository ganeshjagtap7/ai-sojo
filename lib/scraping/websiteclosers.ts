// ⚠️ LOCAL-ONLY (Phase 1). Imports Playwright and launches a real browser, which
// Vercel CANNOT run. Do NOT import it from the app or wire it into
// lib/pipeline/searchPipeline.ts — that would break the production build. Safe
// only as a standalone script (see scripts/test-websiteclosers.ts).
// Production path: port to an Apify actor, then call it from the pipeline.
//
// Runs headless by default. If the site bot-blocks headless (0 cards on page 1),
// re-run with HEADED=1 to use a visible browser.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const LIST_URL = 'https://www.websiteclosers.com/businesses-for-sale/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const DETAIL_CONCURRENCY = 5;

// Retry navigation a few times — the site occasionally responds slowly and a
// single timeout shouldn't abort a ~280-page crawl.
async function gotoRetry(
  page: import('playwright').Page,
  url: string,
  attempts = 3,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return true;
    } catch {
      console.error(`[WebsiteClosers] goto failed (attempt ${i + 1}/${attempts}): ${url}`);
      if (i < attempts - 1) await page.waitForTimeout(3000);
    }
  }
  return false;
}

function parseMoney(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\$?\s*([\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

interface WCCard {
  title: string;
  url: string;
  status: string;
  description: string;
  asking: string;
  cash: string;
}
interface WCDetail {
  grossIncome: string;
  yearEstablished: string;
  wcCode: string;
}

export async function scrapeWebsiteClosers(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });

    // --- 1. Crawl all list pages (until a page returns no cards) ---
    const listPage = await context.newPage();
    await listPage.addInitScript(SHIM);
    const cards: WCCard[] = [];
    for (let p = 1; p <= 60; p++) {
      const url = p === 1 ? LIST_URL : `${LIST_URL}page/${p}/`;
      const ok = await gotoRetry(listPage, url);
      if (!ok) {
        if (p === 1) throw new Error('Could not load the Website Closers list page (try HEADED=1).');
        break; // later page failed after retries — keep what we have
      }
      await listPage.waitForSelector('.post_item', { timeout: 15000 }).catch(() => {});

      const batch: WCCard[] = await listPage.evaluate(() => {
        const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
        const out: WCCard[] = [];
        document.querySelectorAll('.post_item').forEach((el) => {
          const card = el as HTMLElement;
          const titleEl = card.querySelector('a.post_title');
          const title = norm(titleEl?.textContent);
          if (!title) return;
          out.push({
            title,
            url: titleEl?.getAttribute('href') || '',
            status: norm(card.querySelector('.badge')?.textContent),
            description: norm(card.querySelector('.the_content')?.textContent),
            asking: norm(card.querySelector('.asking_price strong')?.textContent),
            cash: norm(card.querySelector('.cash_flow strong')?.textContent),
          });
        });
        return out;
      });

      if (batch.length === 0) break;
      cards.push(...batch);
      console.log(`[WebsiteClosers] list page ${p}: ${batch.length} cards (total ${cards.length})`);
    }
    await listPage.close();

    const byUrl = new Map<string, WCCard>();
    for (const c of cards) if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
    const list = Array.from(byUrl.values());
    console.log(`[WebsiteClosers] unique listings: ${list.length}. Fetching detail pages…`);

    // --- 2. Enrich each listing from its detail page (concurrency pool) ---
    const details = new Map<string, WCDetail>();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        try {
          if (!(await gotoRetry(page, c.url, 2))) continue; // skip after retries
          await page.waitForSelector('.sb-table', { timeout: 15000 }).catch(() => {});
          const d: WCDetail = await page.evaluate(() => {
            const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
            const map: Record<string, string> = {};
            document.querySelectorAll('.sb-table .line').forEach((line) => {
              const label = norm(line.querySelector('.left')?.textContent);
              const value = norm(line.querySelector('.right')?.textContent);
              if (label) map[label] = value;
            });
            const wc = (document.body.innerText.match(/WC\s*\d{2,}/) || [])[0] || '';
            return {
              grossIncome: map['Gross Income'] || '',
              yearEstablished: map['Year Established'] || '',
              wcCode: wc,
            };
          });
          details.set(c.url, d);
        } catch (e) {
          console.error(`[WebsiteClosers] detail failed: ${c.url} — ${(e as Error).message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[WebsiteClosers] details fetched: ${details.size}/${list.length}`);

    const thisYear = new Date().getFullYear();
    return list.map((c) => {
      const d = details.get(c.url);
      const year = d?.yearEstablished ? parseInt(d.yearEstablished, 10) : null;
      return {
        businessName: c.title,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [],
        yearsInBusiness: year && year > 1900 ? thisYear - year : null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'websiteclosers' as const,
        sourceUrl: c.url || LIST_URL,
        mrr: null,
        askingPrice: parseMoney(c.asking),
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseMoney(d?.grossIncome), // Gross Income
        annualProfit: parseMoney(c.cash),          // Cash Flow ≈ SDE/profit
        forSale: !/sold/i.test(c.status),
        founderName: null,
        foundedDate: d?.yearEstablished || null,
        rawData: { ...c, ...d },
      };
    });
  } finally {
    await browser.close();
  }
}
