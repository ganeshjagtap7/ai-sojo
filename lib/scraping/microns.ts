// LOCAL-ONLY (Phase 1) — but API-based, not browser-based. Microns is a SPA
// backed by a Xano REST API; we call it directly with the buyer's `token`
// (read from the saved session in microns-auth.json). No Playwright/browser.
//
// Unlike the other scrapers this has NO browser dependency, so the production
// version could call the Xano API server-side (e.g. on Vercel) with a stored
// token — no Apify needed. Still gated: requires a valid Microns buyer token.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { RawLead, SearchCriteria } from '@/lib/types';

const BASE = 'https://xe1r-a1ss-4juk.n7c.xano.io/api:h-Y0UDzT:v.1.5';
const AUTH_FILE = join(process.cwd(), 'microns-auth.json');
const DETAIL_CONCURRENCY = 8;

function getToken(): string {
  if (!existsSync(AUTH_FILE)) throw new Error('No session. Run: npx tsx scripts/microns-login.ts');
  const state = JSON.parse(readFileSync(AUTH_FILE, 'utf8')) as { cookies?: { name: string; value: string }[] };
  const tok = (state.cookies || []).find((c) => c.name === 'token');
  if (!tok) throw new Error('No `token` cookie in microns-auth.json — re-run scripts/microns-login.ts');
  return decodeURIComponent(tok.value);
}

async function api<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.json() as Promise<T>;
}

interface ListItem {
  id: number | string;
  listingName?: string;
  description?: string;
  customers_number?: number;
  launch_year?: number;
  revenue_type?: string;
  arr?: number;
  asking_price?: number;
  categories?: { category?: string }[];
  under_offer?: boolean;
}
interface ListResp {
  Listings?: { items?: ListItem[]; pageTotal?: number; itemsTotal?: number };
}
interface DetailResp {
  expenses?: number;
  story?: string;
  category?: { category?: string }[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function scrapeMicrons(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const token = getToken();

  // --- 1. Paginate the list API ---
  const items: ListItem[] = [];
  let page = 1;
  let pageTotal = 1;
  do {
    const q =
      `/listings?page=${page}&itemsperpage=50&status=Active&orderBy=desc` +
      `&sortColumn=publish_date&cat=%5B%5D&techstack=%7B%22techstack%22%3A%5B%5D%7D`;
    const data = await api<ListResp>(q, token);
    const L = data.Listings;
    if (!L?.items?.length) break;
    items.push(...L.items);
    pageTotal = L.pageTotal || 1;
    page++;
  } while (page <= pageTotal);
  console.log(`[Microns] listings: ${items.length}`);

  // --- 2. Detail call per listing for expenses (-> profit/margin) + story ---
  const details = new Map<string, DetailResp>();
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const it = items[idx++];
      try {
        const d = await api<DetailResp | DetailResp[]>(`/listings/${it.id}`, token);
        details.set(String(it.id), Array.isArray(d) ? d[0] : d);
      } catch (e) {
        console.error(`[Microns] detail ${it.id} failed: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  console.log(`[Microns] details: ${details.size}/${items.length}`);

  return items.map((it) => {
    const d = details.get(String(it.id)) || {};
    const arr = num(it.arr);
    const expenses = num(d.expenses);
    const profit = arr != null && expenses != null ? arr - expenses : null;
    const margin = profit != null && arr ? Math.round((profit / arr) * 100) : null;
    const asking = num(it.asking_price);
    const cat = it.categories?.[0]?.category || d.category?.[0]?.category || '';
    return {
      businessName: it.listingName || 'Unknown',
      address: null, city: null, state: null, zip: null, phone: null, website: null,
      googleRating: null, reviewCount: null,
      categories: cat ? [cat] : [],
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null, bbbAccredited: null,
      source: 'microns' as const,
      sourceUrl: `https://app.microns.io/buyer/listing?listing_id=${it.id}`,
      mrr: null,
      askingPrice: asking,
      revenueMultiple: asking && arr ? Math.round((asking / arr) * 100) / 100 : null,
      profitMultiple: null,
      annualRevenue: arr,
      annualProfit: profit,
      forSale: !it.under_offer,
      founderName: null,
      foundedDate: it.launch_year ? String(it.launch_year) : null,
      rawData: {
        customers: it.customers_number ?? null,
        revenueType: it.revenue_type ?? null,
        description: it.description ?? null,
        margin,
        underOffer: it.under_offer ?? null,
      },
    };
  });
}
