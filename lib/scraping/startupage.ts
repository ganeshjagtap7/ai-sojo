// ⚠️ LOCAL-ONLY (Phase 1). This module imports Playwright and launches a real
// browser, which Vercel CANNOT bundle/run. Do NOT import it from the app or wire
// it into lib/pipeline/searchPipeline.ts — that would break the production build.
// It is safe only as a standalone script (see scripts/test-startupage.ts).
// Production path: port this scraping logic to an Apify actor, then call that
// actor from the pipeline via ApifyClient (like manta/yellowpages).

import { chromium, type BrowserContext } from 'playwright';
import { existsSync } from 'fs';
import { join } from 'path';
import { RawLead, SearchCriteria } from '@/lib/types';

// StartuPage (startupa.ge) — a startup ecosystem with two deal-sourcing surfaces:
//   1. Opportunities ?category=for-sale  -> startups explicitly listed for sale
//      (each card shows Revenue / Price / Multiple).
//   2. Leaderboard ?tab=startups&sort=revenue -> startups ranked by verified MRR
//      (each row shows startup / founder / MRR), most NOT for sale — acquisition targets.
//
// Phase 1: runs LOCAL Playwright (the production app on Vercel can't run a browser;
// that port to an Apify actor is a later phase). Auth reuses a saved login session.

const FOR_SALE_URL = 'https://startupa.ge/opportunities?category=for-sale';
const LEADERBOARD_URL = 'https://startupa.ge/leaderboard?tab=startups&sort=revenue';
const AUTH_FILE = join(process.cwd(), 'startupage-auth.json');

// --- value parsing -----------------------------------------------------------

// Handles "$480к" (Cyrillic ka), "$142K", "7 billion dollars", "$30000", "N/A".
function parseMoney(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'n/a' || s === '-' || s === '—') return null;

  let mult = 1;
  if (/\bb(illion)?\b|bn\b/.test(s)) mult = 1e9;
  else if (/\bm(illion)?\b|mn\b/.test(s)) mult = 1e6;
  else if (/k|к|thousand/.test(s)) mult = 1e3; // 'к' = Cyrillic ka, used on the site

  const m = s.replace(/,/g, '').match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * mult);
}

// "2.0x", "3.5", "N/A" -> 2, 3.5, null
function parseMultiple(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'n/a') return null;
  const m = s.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// --- auth --------------------------------------------------------------------

// tsx/esbuild rewrites named functions with a `__name(...)` helper. That helper
// lives in the Node module scope, so any function we hand to page.evaluate()
// references a `__name` that doesn't exist in the browser -> "ReferenceError:
// __name is not defined". Inject a no-op shim into every page as a raw string
// (string literals are not transformed by esbuild) before any script runs.
const NAME_SHIM = { content: 'globalThis.__name = globalThis.__name || function (f) { return f; };' };

async function buildContext() {
  const browser = await chromium.launch({ headless: true });

  if (existsSync(AUTH_FILE)) {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    await context.addInitScript(NAME_SHIM);
    return { browser, context };
  }

  // Fallback: plain cookie JSON array in STARTUPAGE_COOKIES (Cookie-Editor *extension* export).
  const envCookies = process.env.STARTUPAGE_COOKIES?.trim();
  if (envCookies) {
    const context = await browser.newContext();
    try {
      const arr = JSON.parse(envCookies) as Record<string, unknown>[];
      const cookies = arr.map((c) => ({
        name: String(c.name),
        value: String(c.value),
        domain: (c.domain as string) || '.startupa.ge',
        path: (c.path as string) || '/',
        httpOnly: Boolean(c.httpOnly),
        secure: c.secure !== false,
        sameSite: (['Strict', 'Lax', 'None'].includes(c.sameSite as string)
          ? (c.sameSite as 'Strict' | 'Lax' | 'None')
          : 'Lax'),
      }));
      await context.addCookies(cookies);
      await context.addInitScript(NAME_SHIM);
      return { browser, context };
    } catch (e) {
      await browser.close();
      throw new Error(
        `STARTUPAGE_COOKIES is not a valid plain cookie JSON array. ` +
          `Easiest fix: run "npx tsx scripts/startupage-login.ts" instead. (${(e as Error).message})`,
      );
    }
  }

  await browser.close();
  throw new Error(
    'No startupa.ge session found. Run "npx tsx scripts/startupage-login.ts" once to log in, ' +
      'then re-run the scraper.',
  );
}

// --- extraction --------------------------------------------------------------

interface SaleCard {
  id: string;
  name: string;
  tagline: string;
  description: string;
  revenue: string;
  price: string;
  multiple: string;
  profileHref: string | null;
  externalUrl: string | null;
}

async function scrapeForSale(context: BrowserContext): Promise<RawLead[]> {
  const page = await context.newPage();
  await page.goto(FOR_SALE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Real structure (verified from the rendered HTML):
  //   div[id^="opportunity-<uuid>"]
  //     h3                      -> startup name
  //     a[href^="/startups/"]   -> profile link (+ tagline <p> next to h3)
  //     .grid .text-center × 3  -> {label <p>, value <p>} for Revenue / Price / Multiple
  //     p.leading-relaxed       -> description
  //     a[target="_blank"]      -> external product URL ("View Details")
  const cards: SaleCard[] = await page.evaluate(() => {
    const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
    const out: SaleCard[] = [];

    document.querySelectorAll('div[id^="opportunity-"]').forEach((cardEl) => {
      const card = cardEl as HTMLElement;
      const h3 = card.querySelector('h3');
      const name = norm(h3?.textContent);
      if (!name) return;

      const tagline = norm(h3?.parentElement?.querySelector('p')?.textContent);

      // Revenue / Price / Multiple — read each stat block by its label.
      let revenue = '', price = '', multiple = '';
      card.querySelectorAll('.text-center').forEach((blk) => {
        const ps = blk.querySelectorAll('p');
        if (ps.length < 2) return;
        const label = norm(ps[0].textContent).toLowerCase();
        const value = norm(ps[1].textContent);
        if (label.includes('revenue')) revenue = value;
        else if (label.includes('price')) price = value;
        else if (label.includes('multiple')) multiple = value;
      });

      const profileLink = card.querySelector('a[href^="/startups/"]') as HTMLAnchorElement | null;
      const external = card.querySelector('a[target="_blank"]') as HTMLAnchorElement | null;

      out.push({
        id: card.id.replace(/^opportunity-/, ''),
        name,
        tagline,
        description: norm(card.querySelector('p.leading-relaxed')?.textContent),
        revenue,
        price,
        multiple,
        profileHref: profileLink ? profileLink.getAttribute('href') : null,
        externalUrl: external ? external.href : null,
      });
    });
    return out;
  });

  await page.close();
  console.log(`[StartuPage] for-sale cards parsed: ${cards.length}`);

  // Founder and founding date aren't on the for-sale card — they live on each
  // startup's profile page as JSON-LD (schema.org Organization.founder /
  // .foundingDate). Visit each profile and read both.
  const profileByName = new Map<string, { founder: string; founded: string }>();
  const profilePage = await context.newPage();
  for (const c of cards) {
    if (!c.profileHref) continue;
    try {
      await profilePage.goto(`https://startupa.ge${c.profileHref}`, { waitUntil: 'domcontentloaded' });
      const info = await profilePage.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent || '');
            const items = Array.isArray(data) ? data : [data];
            for (const d of items) {
              if (d && d['@type'] === 'Organization') {
                const f = d.founder;
                const names = (Array.isArray(f) ? f : [f]).map((p) => p && p.name).filter(Boolean);
                return { founder: names.join(', '), founded: d.foundingDate || '' };
              }
            }
          } catch { /* skip non-JSON script */ }
        }
        return { founder: '', founded: '' };
      });
      if (info.founder || info.founded) profileByName.set(c.name.toLowerCase(), info);
    } catch (e) {
      console.error(`[StartuPage] profile lookup failed for "${c.name}":`, (e as Error).message);
    }
  }
  await profilePage.close();
  console.log(`[StartuPage] profiles resolved: ${profileByName.size}/${cards.length}`);

  return cards.map((c) => ({
    businessName: c.name,
    address: null, city: null, state: null, zip: null, phone: null,
    website: c.externalUrl ?? (c.profileHref ? `https://startupa.ge${c.profileHref}` : null),
    googleRating: null, reviewCount: null,
    categories: c.tagline ? [c.tagline] : [],
    yearsInBusiness: null, employeeCount: null,
    bbbRating: null, bbbAccredited: null,
    source: 'startupage' as const,
    sourceUrl: `https://startupa.ge/opportunities?id=${c.id}`,
    mrr: null, // for-sale card shows "Revenue", not MRR; MRR is filled from the leaderboard on merge
    askingPrice: parseMoney(c.price),
    revenueMultiple: parseMultiple(c.multiple),
    annualRevenue: parseMoney(c.revenue),
    forSale: true,
    founderName: profileByName.get(c.name.toLowerCase())?.founder || null,
    foundedDate: profileByName.get(c.name.toLowerCase())?.founded || null,
    rawData: c,
  }));
}

interface LbRow {
  name: string;
  description: string;
  founder: string;
  mrr: string;
}

async function scrapeLeaderboard(context: BrowserContext): Promise<RawLead[]> {
  const page = await context.newPage();
  await page.goto(LEADERBOARD_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Structure-agnostic: the leaderboard mixes a "podium" for the top 3 (name in
  // an <a class="font-semibold">, no border-b wrapper) with normal rows (name in
  // a <span class="font-semibold">, wrapped in div.border-b.border-black). Both
  // expose the startup name via .font-semibold and the MRR via a .text-right cell.
  // So: take every name node and walk up to whatever ancestor holds its MRR.
  const rows: LbRow[] = await page.evaluate(() => {
    const norm = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();
    const out: LbRow[] = [];
    const seen = new Set<string>();

    document.querySelectorAll('span.font-semibold, a.font-semibold').forEach((nameEl) => {
      const name = norm(nameEl.textContent);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;

      // Ascend until we hit a row-like ancestor that carries an MRR ($) value.
      let row: HTMLElement | null = nameEl.parentElement;
      let mrr = '';
      for (let up = 0; up < 6 && row; up++) {
        const cand = row.querySelector('.text-right');
        const t = norm(cand?.textContent);
        if (cand && /\$/.test(t)) { mrr = t; break; }
        row = row.parentElement;
      }
      if (!mrr || !row) return; // not a leaderboard entry (header, nav, etc.)
      seen.add(key);

      const tagline = norm(nameEl.parentElement?.querySelector('p')?.textContent);
      // Founder(s): avatar alt text (handles co-founders); fall back to a profile
      // link that isn't the startup's own /startups/ link.
      const alts = Array.from(row.querySelectorAll('img[alt]'))
        .map((img) => norm(img.getAttribute('alt')))
        .filter((a) => a && a.toLowerCase() !== key);
      let founder = alts.join(', ');
      if (!founder) {
        const link = row.querySelector('a[href^="/"]:not([href^="/startups"])');
        founder = norm(link?.textContent);
      }

      out.push({ name, description: tagline, founder, mrr });
    });
    return out;
  });

  await page.close();
  console.log(`[StartuPage] leaderboard rows parsed: ${rows.length}`);

  return rows.map((r) => ({
    businessName: r.name,
    address: null, city: null, state: null, zip: null, phone: null, website: null,
    googleRating: null, reviewCount: null,
    categories: r.description ? [r.description] : [],
    yearsInBusiness: null, employeeCount: null,
    bbbRating: null, bbbAccredited: null,
    source: 'startupage' as const,
    sourceUrl: LEADERBOARD_URL,
    mrr: parseMoney(r.mrr),
    askingPrice: null,
    revenueMultiple: null,
    annualRevenue: null,
    forSale: false,
    founderName: r.founder || null,
    rawData: r,
  }));
}

// Merge by startup name. For-sale row wins (it has price/multiple); pull MRR and
// founder from the leaderboard row when the for-sale card lacked them.
function merge(forSale: RawLead[], leaderboard: RawLead[]): RawLead[] {
  const byName = new Map<string, RawLead>();
  const key = (n: string) => n.toLowerCase().trim();

  for (const lead of leaderboard) byName.set(key(lead.businessName), lead);
  for (const lead of forSale) {
    const k = key(lead.businessName);
    const lb = byName.get(k);
    if (lb) {
      byName.set(k, {
        ...lead,
        mrr: lead.mrr ?? lb.mrr,
        founderName: lead.founderName ?? lb.founderName,
        forSale: true,
      });
    } else {
      byName.set(k, lead);
    }
  }
  return Array.from(byName.values());
}

/**
 * Scrape StartuPage. `criteria` is accepted for pipeline-signature parity but the
 * marketplace is small, so we currently pull all listings and let downstream
 * dedup/rank/filter handle relevance.
 */
export async function scrapeStartuPage(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const { browser, context } = await buildContext();
  try {
    const [forSale, leaderboard] = await Promise.all([
      scrapeForSale(context),
      scrapeLeaderboard(context),
    ]);
    const merged = merge(forSale, leaderboard);
    console.log(`[StartuPage] total unique leads: ${merged.length}`);
    return merged;
  } finally {
    await browser.close();
  }
}
