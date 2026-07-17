// "Atlanta Premier Plumbing, LLC" → "atlanta premier plumbing"
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co|company|llp|pllc|dba)\b\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "(404) 555-0123" → "4045550123"
export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

// "https://www.atlantaplumbing.com/about" → "atlantaplumbing.com"
export function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Canonical listing key: host + path, minus protocol/www/query/fragment/trailing
// slash. Two scrapes of the same listing (tracking params, http/https, trailing
// slash) collapse to one key.
// "https://www.bizbuysell.com/business-opportunity/foo/123/?utm=x#a"
//   → "bizbuysell.com/business-opportunity/foo/123"
export function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
