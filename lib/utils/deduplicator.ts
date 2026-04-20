import { RawLead } from '@/lib/types';
import { normalizeName, normalizePhone, extractDomain } from './normalizers';

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
  };
}

export function deduplicateLeads(leads: RawLead[]): RawLead[] {
  const seen = new Map<string, RawLead>();

  for (const lead of leads) {
    const nameKey = normalizeName(lead.businessName);
    const phoneKey = normalizePhone(lead.phone);
    const domainKey = extractDomain(lead.website);

    const matchKey =
      (nameKey && lead.city ? `name::${nameKey}::${lead.city.toLowerCase()}` : null) ||
      (phoneKey ? `phone::${phoneKey}` : null) ||
      (domainKey ? `domain::${domainKey}` : null) ||
      `unique::${lead.businessName}::${Math.random()}`;

    if (seen.has(matchKey)) {
      seen.set(matchKey, mergeLeads(seen.get(matchKey)!, lead));
    } else {
      seen.set(matchKey, lead);
    }
  }

  return Array.from(seen.values());
}
