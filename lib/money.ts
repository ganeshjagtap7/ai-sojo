// Currency handling for lead financials.
//
// Priority, per the product rule "show what the listing shows":
//   1. An explicit `currency` the scraper captured from the source.
//   2. The currency detected from the source's raw price text (₹, $, £, "Cr"…).
//   3. A per-source region fallback (Indian marketplaces → INR, etc.).
//   4. USD as the last resort.
// Amounts are then formatted with the right symbol + locale grouping.

// ISO 4217 of the money on each source, used only when the raw text carried no
// currency signal. Most marketplaces are USD; the India desks quote INR.
const SOURCE_CURRENCY: Record<string, string> = {
  businessex: 'INR',
  buybiz: 'INR',
  smedealz: 'INR',
  indiabiz: 'INR',
  mergerdomo: 'INR',
  tobuz: 'INR',
  businessdeals: 'INR',
};

/** Detect an ISO 4217 code from raw listing text (a price string, description…).
 *  Returns null when no currency signal is present. */
export function detectCurrency(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  // Indian: ₹, Rs, INR, and the crore/lakh magnitude words unique to INR quoting.
  if (/₹|(?:^|[^a-z])rs\.?(?:[^a-z]|$)|\binr\b|\bcrore?s?\b|\bcr\b|\blakhs?\b/.test(t)) return 'INR';
  if (/£|\bgbp\b/.test(t)) return 'GBP';
  if (/€|\beur\b/.test(t)) return 'EUR';
  if (/\baed\b|dirhams?|د\.إ/.test(t)) return 'AED';
  if (/c\$|\bcad\b/.test(t)) return 'CAD';
  if (/a\$|\baud\b/.test(t)) return 'AUD';
  if (/s\$|\bsgd\b/.test(t)) return 'SGD';
  // Plain "$" / USD last, since the specific $-prefixes above are checked first.
  if (/\$|\busd\b/.test(t)) return 'USD';
  return null;
}

/** Region fallback when a source stated no currency. */
export function currencyForSource(source: string): string {
  return SOURCE_CURRENCY[source] ?? 'USD';
}

/** Format an amount with its currency symbol and locale-appropriate grouping
 *  (e.g. INR uses the Indian 1,20,00,000 grouping via en-IN). */
export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Unknown/invalid ISO code — fall back to a plain grouped number.
    return amount.toLocaleString('en-US');
  }
}
