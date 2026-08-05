import { RawLead } from '@/lib/types';
import { normalizeName, normalizePhone, extractDomain, normalizeUrl } from './normalizers';

// Sources whose `phone` is the BUSINESS's own line (local/niche directories) —
// safe to use as an identity key. Marketplaces list a broker/seller
// intermediary's number (e.g. BizBuySell's contact_phone is the broker), so two
// unrelated businesses listed by the same broker share it. Merging on phone
// alone would silently collapse them into one — so we only trust phone as an
// identity signal for these sources.
const BUSINESS_PHONE_SOURCES = new Set<RawLead['source']>([
  'google_maps', 'web_search', 'bbb', 'yellowpages', 'manta',
  'hvacinformed', 'esa', 'serviceexperts',
]);

// Placeholder names several scrapers emit when title extraction fails (e.g.
// `str(item.title) || 'Unknown'`). These carry NO identity — two unrelated
// listings that both failed to parse would share `name::unknown` and get merged
// (one's price/revenue/URL silently dropped). So we never treat a name that
// normalizes to one of these as an identity key; such leads still merge on a
// real signal (listing URL / domain / business phone) but never on the name.
const GENERIC_NAMES = new Set(['unknown', 'unknown company', 'na', 'n a', 'untitled', 'no name']);

function mergeLeads(existing: RawLead, incoming: RawLead): RawLead {
  return {
    ...existing,
    address: existing.address ?? incoming.address,
    city: existing.city ?? incoming.city,
    state: existing.state ?? incoming.state,
    zip: existing.zip ?? incoming.zip,
    phone: existing.phone ?? incoming.phone,
    website: existing.website ?? incoming.website,
    googleRating: existing.googleRating ?? incoming.googleRating,
    reviewCount: existing.reviewCount ?? incoming.reviewCount,
    categories: existing.categories.length ? existing.categories : incoming.categories,
    yearsInBusiness: existing.yearsInBusiness ?? incoming.yearsInBusiness,
    employeeCount: existing.employeeCount ?? incoming.employeeCount,
    bbbRating: existing.bbbRating ?? incoming.bbbRating,
    bbbAccredited: existing.bbbAccredited ?? incoming.bbbAccredited,
    // Deal fields (§6): a business cross-listed on two marketplaces must not lose
    // its price/revenue/etc. on merge — keep whichever source supplied them.
    mrr: existing.mrr ?? incoming.mrr,
    askingPrice: existing.askingPrice ?? incoming.askingPrice,
    revenueMultiple: existing.revenueMultiple ?? incoming.revenueMultiple,
    profitMultiple: existing.profitMultiple ?? incoming.profitMultiple,
    annualRevenue: existing.annualRevenue ?? incoming.annualRevenue,
    annualProfit: existing.annualProfit ?? incoming.annualProfit,
    currency: existing.currency ?? incoming.currency,
    forSale: existing.forSale ?? incoming.forSale,
    founderName: existing.founderName ?? incoming.founderName,
    foundedDate: existing.foundedDate ?? incoming.foundedDate,
    sourceUrl: existing.sourceUrl ?? incoming.sourceUrl,
  };
}

/**
 * All the identity keys a lead can match on. A lead is a duplicate of an
 * existing row if they share ANY key — so a business cross-listed on two
 * marketplaces (same name, different URLs) still merges via the name key, and
 * the same listing re-scraped (same URL, different headline) merges via the URL
 * key. Order/priority no longer matters since every key is checked.
 */
function keysFor(lead: RawLead): string[] {
  const keys: string[] = [];
  const urlKey = normalizeUrl(lead.sourceUrl);
  const nameKey = normalizeName(lead.businessName);
  const phoneKey = normalizePhone(lead.phone);
  const domainKey = extractDomain(lead.website);

  if (urlKey) keys.push(`listing::${urlKey}`); // same listing (re-scrape/params)
  // Same name in the same city (local businesses); or same name, no city
  // (online businesses cross-listed across marketplaces). Placeholder names
  // (GENERIC_NAMES) are non-identifying and never emit a name key.
  const nameIsIdentifying = nameKey && !GENERIC_NAMES.has(nameKey);
  if (nameIsIdentifying && lead.city) keys.push(`name::${nameKey}::${lead.city.toLowerCase()}`);
  else if (nameIsIdentifying) keys.push(`name::${nameKey}`);
  // Only trust phone as an identity key for sources where it's the business's
  // own line — not marketplaces/brokers (see BUSINESS_PHONE_SOURCES).
  if (phoneKey && BUSINESS_PHONE_SOURCES.has(lead.source)) keys.push(`phone::${phoneKey}`);
  if (domainKey) keys.push(`domain::${domainKey}`);
  return keys;
}

export function deduplicateLeads(leads: RawLead[]): RawLead[] {
  const keyToIndex = new Map<string, number>();
  const result: RawLead[] = [];

  for (const lead of leads) {
    const keys = keysFor(lead);
    // Merge into the first existing row that shares any identity key.
    let idx = -1;
    for (const k of keys) {
      const hit = keyToIndex.get(k);
      if (hit !== undefined) {
        idx = hit;
        break;
      }
    }
    if (idx >= 0) {
      result[idx] = mergeLeads(result[idx], lead);
    } else {
      idx = result.length;
      result.push(lead);
    }
    // (Re)register every key of the row so later leads can match on any of them.
    for (const k of keysFor(result[idx])) keyToIndex.set(k, idx);
  }

  return result;
}
