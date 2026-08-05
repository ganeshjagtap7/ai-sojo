// Guard against open-redirect via a `?next=` param. Only allow same-origin,
// relative paths (e.g. "/app", "/app/onboarding"); anything else — an absolute
// URL ("https://evil.com") or a protocol-relative one ("//evil.com") — falls
// back to the safe default. Shared so pages and server actions sanitize the
// same way.
export function safeNext(raw: string, fallback: string): string {
  // Normalize backslashes to forward slashes FIRST. Browsers (and many URL
  // parsers) treat "\" as "/", so "/\evil.com" or "/\/evil.com" becomes a
  // protocol-relative "//evil.com" → an open redirect that the naive
  // `!startsWith('//')` check misses. Reject anything that is protocol-relative
  // or absolute after normalization.
  const s = raw.replace(/\\/g, '/');
  return s.startsWith('/') && !s.startsWith('//') ? s : fallback;
}
