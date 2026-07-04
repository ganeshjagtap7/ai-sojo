// ⚠️ LOCAL-ONLY (Phase 1). Uses the official Product Hunt GraphQL API (token).
// See scripts/test-producthunt.ts.
//
// Product Hunt is a product-LAUNCH platform, not a for-sale marketplace — so the
// deal fields (askingPrice/mrr/forSale) stay empty. It's a sourcing list of new
// products + their makers. We use the official API (api.producthunt.com/v2/api/graphql,
// order: NEWEST) so "recent N from today backward" is just newest-first pagination.
// Needs PH_TOKEN (a free developer token) in env or .env.local.
//   Default fetches ALL (paginates back as far as allowed). PH_LIMIT=500 caps to
//   the 500 most recent launches.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RawLead, SearchCriteria } from '@/lib/types';

const ENDPOINT = 'https://api.producthunt.com/v2/api/graphql';
const PAGE = 50;

// PH_TOKEN from process.env, falling back to .env.local (tsx doesn't auto-load it).
function token(): string {
  if (process.env.PH_TOKEN) return process.env.PH_TOKEN;
  const f = join(process.cwd(), '.env.local');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf-8').match(/^\s*PH_TOKEN\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const limitFromEnv = (): number => {
  if (process.env.PH_LIMIT === undefined) return Infinity;
  const n = parseInt(process.env.PH_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

const QUERY = `query($after: String) {
  posts(order: NEWEST, first: ${PAGE}, after: $after) {
    pageInfo { endCursor hasNextPage }
    edges { node {
      id name tagline description slug url website createdAt
      topics { edges { node { name } } }
      makers { name username headline }
    } }
  }
}`;

interface Maker { name?: string; username?: string; headline?: string }
interface Node {
  name?: string;
  tagline?: string;
  description?: string;
  slug?: string;
  url?: string;
  website?: string;
  createdAt?: string;
  topics?: { edges?: { node?: { name?: string } }[] };
  makers?: Maker[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scrapeProductHunt(_criteria?: SearchCriteria): Promise<RawLead[]> {
  const tok = token();
  if (!tok) throw new Error('PH_TOKEN missing — add it to .env.local (see scripts/test-producthunt.ts header).');
  const limit = limitFromEnv();

  const nodes: Node[] = [];
  let after: string | null = null;
  while (nodes.length < limit) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { after } }),
      });
    } catch {
      break;
    }
    // rate limit: wait for the window to reset, then retry the same page
    if (res.status === 429) {
      const reset = parseInt(res.headers.get('X-Rate-Limit-Reset') || res.headers.get('Retry-After') || '60', 10);
      console.log(`[ProductHunt] rate-limited; sleeping ${reset}s…`);
      await sleep((Number.isFinite(reset) ? reset : 60) * 1000 + 1000);
      continue;
    }
    if (!res.ok) break;
    const json = (await res.json()) as {
      data?: { posts?: { pageInfo?: { endCursor?: string; hasNextPage?: boolean }; edges?: { node?: Node }[] } };
      errors?: { message?: string }[];
    };
    if (json.errors?.length) {
      // complexity/rate errors arrive as GraphQL errors too — back off once
      const msg = json.errors[0]?.message || '';
      if (/rate|complexity|limit/i.test(msg)) {
        console.log(`[ProductHunt] ${msg} — sleeping 60s…`);
        await sleep(61000);
        continue;
      }
      throw new Error(`ProductHunt API error: ${msg}`);
    }
    const posts = json.data?.posts;
    const edges = posts?.edges ?? [];
    if (edges.length === 0) break;
    for (const e of edges) {
      if (e.node) nodes.push(e.node);
      if (nodes.length >= limit) break;
    }
    console.log(`[ProductHunt] fetched ${nodes.length}${limit === Infinity ? '' : `/${limit}`}`);
    if (!posts?.pageInfo?.hasNextPage || nodes.length >= limit) break;
    after = posts.pageInfo.endCursor ?? null;
    if (!after) break;
  }
  console.log(`[ProductHunt] total products: ${nodes.length}`);

  return nodes.map((n): RawLead => {
    const topics = (n.topics?.edges ?? []).map((e) => e.node?.name).filter(Boolean) as string[];
    const makers = (n.makers ?? []).map((m) => ({
      name: m.name || m.username || '',
      profile: m.username ? `https://www.producthunt.com/@${m.username}` : '',
    }));
    return {
      businessName: n.name || 'Unknown',
      address: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      website: n.website || null,
      googleRating: null,
      reviewCount: null,
      categories: topics,
      yearsInBusiness: null,
      employeeCount: null,
      bbbRating: null,
      bbbAccredited: null,
      source: 'producthunt' as const,
      sourceUrl: n.url || (n.slug ? `https://www.producthunt.com/posts/${n.slug}` : 'https://www.producthunt.com'),
      mrr: null,
      askingPrice: null, // not a for-sale marketplace
      revenueMultiple: null,
      profitMultiple: null,
      annualRevenue: null,
      annualProfit: null,
      forSale: null,
      founderName: makers[0]?.name || null,
      foundedDate: n.createdAt || null,
      rawData: {
        tagline: n.tagline || null,
        description: n.description || null,
        website: n.website || null,
        topics: topics.join(', ') || null,
        launchDate: n.createdAt || null,
        makers, // [{ name, profile }]
        phUrl: n.url || null,
      },
    };
  });
}
