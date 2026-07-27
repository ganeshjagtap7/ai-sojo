// Guard against open-redirect via a `?next=` param. Only allow same-origin,
// relative paths (e.g. "/app", "/app/onboarding"); anything else — an absolute
// URL ("https://evil.com") or a protocol-relative one ("//evil.com") — falls
// back to the safe default. Shared so pages and server actions sanitize the
// same way.
export function safeNext(raw: string, fallback: string): string {
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}
