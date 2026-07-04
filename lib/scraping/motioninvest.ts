// ⚠️ LOCAL-ONLY (Phase 1). Imports Playwright + launches a real browser; Vercel
// CANNOT run it. Do NOT import from the app or wire into searchPipeline.ts.
// Safe only as a standalone script (see scripts/test-motioninvest.ts).
//
// Motion Invest GATES data behind login — uses the saved session from
// scripts/motioninvest-login.ts (motioninvest-auth.json). Default headless;
// re-run HEADED=1 if blocked.

import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { join } from 'path';
import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://motioninvest.com';
const LIST_URL = `${BASE}/marketplace`;
const AUTH_FILE = join(process.cwd(), 'motioninvest-auth.json');
const SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };
const DETAIL_CONCURRENCY = 5;

function parseMoney(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/,/g, '');
  const m = s.match(/\$?\s*([\d.]+)\s*([km])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/k/i.test(m[2] || '')) n *= 1e3;
  else if (/m/i.test(m[2] || '')) n *= 1e6;
  return Math.round(n);
}
function parseFloatish(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

interface MICard {
  name: string;
  type: string;
  niche: string;
  url: string;
  monthlyIncome: string;
  monthlyViews: string;
  subscribers: string;
  totalViews: string;
  monetization: string;
  asking: string;
}
interface MIDetail {
  incomeMultiple: string;
  established: string;
  totalIncome12: string;
  last12Avg: string;
  overview: string;
}

export async function scrapeMotionInvest(_criteria?: SearchCriteria): Promise<RawLead[]> {
  if (!existsSync(AUTH_FILE)) {
    throw new Error('No session. Run: npx tsx scripts/motioninvest-login.ts');
  }
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  try {
    const context = await browser.newContext({ storageState: AUTH_FILE });

    // --- 1. List page (single page, lazy-loads on scroll) ---
    const listPage = await context.newPage();
    await listPage.addInitScript(SHIM);
    await listPage.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await listPage.waitForSelector('text=Asking Price', { timeout: 40000 }).catch(() => {});
    let prev = -1;
    for (let i = 0; i < 20; i++) {
      const n = await listPage.evaluate(() => document.querySelectorAll('a[href^="/marketplace/"]').length);
      if (n === prev) break;
      prev = n;
      await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await listPage.waitForTimeout(700);
    }

    const cards: MICard[] = await listPage.evaluate(() => {
      const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
      const out: MICard[] = [];
      document.querySelectorAll('a[href^="/marketplace/"]').forEach((aEl) => {
        const a = aEl as HTMLAnchorElement;
        if (!/view details/i.test(norm(a.textContent))) return;
        const card = a.closest('.animate-fade-in') as HTMLElement | null;
        if (!card) return;
        const img = card.querySelector('img');
        const name = norm(img?.getAttribute('alt'))
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/^youtube\.com\//i, '');
        const badges = Array.from(card.querySelectorAll('.absolute.top-3.left-3 > div')).map((b) => norm(b.textContent));
        const metrics: Record<string, string> = {};
        card.querySelectorAll('.text-center').forEach((b) => {
          const ps = b.querySelectorAll('p');
          if (ps.length < 2) return;
          metrics[norm(ps[0].textContent).toUpperCase()] = norm(ps[1].textContent);
        });
        out.push({
          name,
          type: badges[0] || '',
          niche: badges[1] || '',
          url: a.getAttribute('href') || '',
          monthlyIncome: metrics['MONTHLY INCOME'] || '',
          monthlyViews: metrics['MONTHLY VIEWS'] || '',
          subscribers: metrics['SUBSCRIBERS'] || '',
          totalViews: metrics['TOTAL VIEWS'] || '',
          monetization: metrics['MONETIZATION'] || '',
          asking: metrics['ASKING PRICE'] || '',
        });
      });
      return out;
    });
    await listPage.close();

    const byUrl = new Map<string, MICard>();
    for (const c of cards) if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
    const list = Array.from(byUrl.values());
    console.log(`[MotionInvest] listings: ${list.length}. Fetching detail pages…`);

    // --- 2. Detail enrichment (Income Multiple, Established, Total/Avg income, Overview) ---
    const details = new Map<string, MIDetail>();
    let idx = 0;
    const worker = async () => {
      const page = await context.newPage();
      await page.addInitScript(SHIM);
      while (idx < list.length) {
        const c = list[idx++];
        const url = c.url.startsWith('http') ? c.url : `${BASE}${c.url}`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForSelector('text=Income Multiple', { timeout: 20000 }).catch(() => {});
          const data = await page.evaluate(() => {
            const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
            const heads = Array.from(document.querySelectorAll('h2,h3,h4'));
            const ov = heads.find((h) => /^overview$/i.test(norm(h.textContent)));
            let overview = '';
            if (ov) {
              const root = ov.closest('div')?.parentElement || document;
              const p = root.querySelector('p');
              overview = norm(p?.textContent);
            }
            return { text: document.body.innerText, overview };
          });
          const t = data.text;
          const grab = (re: RegExp) => (t.match(re) || [])[1] || '';
          details.set(c.url, {
            incomeMultiple: grab(/Income Multiple\s*([\d.,]+)/i),
            established: grab(/Established\s*([\d/]{6,10})/i),
            totalIncome12: grab(/Total Income \(Last 12 Months\):?\s*\$?\s*([\d,]+)/i),
            last12Avg: grab(/Last 12 Month Average\s*\$?\s*([\d,]+)/i),
            overview: data.overview,
          });
        } catch (e) {
          console.error(`[MotionInvest] detail failed: ${url} — ${(e as Error).message}`);
        }
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
    console.log(`[MotionInvest] details fetched: ${details.size}/${list.length}`);

    return list.map((c) => {
      const d = details.get(c.url);
      return {
        businessName: c.name,
        address: null, city: null, state: null, zip: null, phone: null, website: null,
        googleRating: null, reviewCount: null,
        categories: [c.type, c.niche].filter(Boolean),
        yearsInBusiness: null,
        employeeCount: null,
        bbbRating: null, bbbAccredited: null,
        source: 'motioninvest' as const,
        sourceUrl: c.url.startsWith('http') ? c.url : `${BASE}${c.url}`,
        mrr: parseMoney(c.monthlyIncome),
        askingPrice: parseMoney(c.asking),
        revenueMultiple: parseFloatish(d?.incomeMultiple),
        profitMultiple: null,
        annualRevenue: parseMoney(d?.totalIncome12),
        annualProfit: null,
        forSale: true,
        founderName: null,
        foundedDate: d?.established || null,
        rawData: { ...c, ...d },
      };
    });
  } finally {
    await browser.close();
  }
}
