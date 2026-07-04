// ⚠️ LOCAL-ONLY (Phase 1). Imports Playwright + launches a real browser; Vercel
// CANNOT run it. Do NOT import from the app or wire into searchPipeline.ts.
// Safe only as a standalone script (see scripts/test-synergy.ts).
//
// Synergy Business Brokers — PUBLIC mid-market broker. List uses FacetWP
// infinite scroll ("LOADING…"), so we scroll to load all, then visit each
// detail page for EBITDA / Employees / Reason for Sale + the broker contact.

import { chromium } from 'playwright';
import { RawLead, SearchCriteria } from '@/lib/types';

const LIST_URL = 'https://synergybb.com/businesses-for-sale/';
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
function parseInt0(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

interface SynCard {
  name: string;
  url: string;
  asking: string;
  annualRevenue: string;
  netCashFlow: string;
  description: string;
  industry: string;
  location: string;
}
interface SynDetail {
  ebitda: string;
  reasonForSale: string;
  employees: string;
  brokerName: string;
  brokerTitle: string;
  brokerPhone: string;
  brokerEmail: string;
}

export async function scrapeSynergy(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1400, height: 900 } });
    const listPage = await context.newPage();
    await listPage.addInitScript(SHIM);
    await listPage.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await listPage.waitForSelector('.sale-list-item', { timeout: 30000 }).catch(() => {});

    // FacetWP infinite-scroll RE-RENDERS the whole list on each page-load, so the
    // card count flickers (briefly 0) mid-render. To be immune to that, extract +
    // merge cards by URL on EVERY iteration and stop only when no NEW cards appear
    // for several rounds. Never scroll UP (that reloads page 1).
    const extractCards = (): SynCard[] => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const out: SynCard[] = [];
      document.querySelectorAll('.sale-list-item').forEach((el) => {
        const card = el as HTMLElement;
        const a = card.querySelector('a.sale-list-item-title') as HTMLAnchorElement | null;
        const name = norm(a?.textContent);
        if (!name) return;
        let annualRevenue = '', netCashFlow = '';
        card.querySelectorAll('h5 span').forEach((s) => {
          const txt = norm(s.textContent);
          if (/annual revenue/i.test(txt)) annualRevenue = txt;
          else if (/net cash flow/i.test(txt)) netCashFlow = txt;
        });
        const industry = Array.from(card.querySelectorAll('.sale-list-category li a'))
          .map((x) => norm(x.textContent)).filter(Boolean).join(', ');
        out.push({
          name,
          url: a?.getAttribute('href') || '',
          asking: norm(card.querySelector('.sale-list-item-price')?.textContent),
          annualRevenue,
          netCashFlow,
          description: norm(card.querySelector('.sale-list-item-content-dsec')?.textContent),
          industry,
          location: norm(card.querySelector('.sale-list-location-btn h6')?.textContent),
        });
      });
      return out;
    };

    const byUrl = new Map<string, SynCard>();
    let dry = 0;
    for (let i = 0; i < 500 && dry < 6; i++) {
      const batch = (await listPage.evaluate(extractCards)) as SynCard[];
      let added = 0;
      for (const c of batch) if (c.url && !byUrl.has(c.url)) { byUrl.set(c.url, c); added++; }
      dry = added > 0 ? 0 : dry + 1;
      if (i % 4 === 0) console.log(`[Synergy] collected ${byUrl.size} unique…`);

      const btn = listPage.locator('button.facetwp-load-more').first();
      if ((await btn.count()) === 0) {
        await listPage.waitForTimeout(1500); // let any final render settle
        for (const c of (await listPage.evaluate(extractCards)) as SynCard[]) {
          if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
        }
        break;
      }
      // Trigger the next page: scroll the button into view AND trusted-click it
      // (covers both infinite-scroll-on-view and click modes). Merge above makes
      // any re-render flicker harmless.
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ timeout: 4000 }).catch(() => {});
      await listPage.waitForTimeout(2200);
    }
    await listPage.close();

    const list = Array.from(byUrl.values());
    console.log(`[Synergy] listings: ${list.length}. Fetching detail pages…`);

    // Detail enrichment: EBITDA / Reason / Employees + broker contact.
    const details = new Map<string, SynDetail>();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        try {
          await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('.listing-info', { timeout: 15000 }).catch(() => {});
          const d: SynDetail = await page.evaluate(() => {
            const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
            // <p><strong>Label:</strong> value</p>
            const fields: Record<string, string> = {};
            document.querySelectorAll('.listing-info p').forEach((p) => {
              const strong = p.querySelector('strong');
              if (!strong) return;
              const label = norm(strong.textContent).replace(/:$/, '');
              const value = norm(p.textContent).replace(norm(strong.textContent), '').trim();
              if (label) fields[label] = value;
            });
            const h3 = document.querySelector('.broker-info-text h3');
            const title = norm(h3?.querySelector('span')?.textContent);
            const name = norm(h3?.textContent).replace(title, '').trim();
            const contact = document.querySelector('.broker-info-details-contact');
            const tel = contact?.querySelector('a[href^="tel:"]');
            const mail = contact?.querySelector('a[href^="mailto:"]');
            return {
              ebitda: fields['EBITDA'] || '',
              reasonForSale: fields['Reason For Sale'] || '',
              employees: fields['Employees'] || '',
              brokerName: name,
              brokerTitle: title,
              brokerPhone: norm(tel?.textContent),
              brokerEmail: (mail?.getAttribute('href') || '').replace(/^mailto:/, ''),
            };
          });
          details.set(c.url, d);
        } catch (e) {
          console.error(`[Synergy] detail failed: ${c.url} — ${(e as Error).message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[Synergy] details fetched: ${details.size}/${list.length}`);

    return list.map((c) => {
      const d = details.get(c.url);
      // "Has Accepted Offer" listings are done deals — placeholder detail pages.
      const accepted = /accepted offer/i.test(`${c.name} ${c.description}`);
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: c.industry ? c.industry.split(',').map((s) => s.trim()) : [],
        yearsInBusiness: null,
        employeeCount: parseInt0(d?.employees),
        bbbRating: null, bbbAccredited: null,
        source: 'synergy' as const,
        sourceUrl: c.url || LIST_URL,
        mrr: null,
        askingPrice: parseMoney(c.asking),
        revenueMultiple: null,
        profitMultiple: null,
        annualRevenue: parseMoney(c.annualRevenue),
        annualProfit: parseMoney(c.netCashFlow), // Net Cash Flow ≈ SDE
        forSale: !accepted,
        founderName: null,
        foundedDate: null,
        rawData: { ...c, ...d, status: accepted ? 'Has Accepted Offer' : 'Available' },
      };
    });
  } finally {
    await browser.close();
  }
}
