/**
 * Friendly message for a failed client action (e.g. saving a thesis).
 *
 * - A network failure makes fetch throw a TypeError → show a connection message
 *   rather than a raw "Failed to fetch".
 * - A thrown Error whose message we set ourselves (e.g. a server 4xx passed
 *   through deliberately) is shown as-is.
 * - Anything else → the caller's calm fallback.
 *
 * Callers decide at the throw site which server messages are user-facing (pass
 * them through) vs. technical (throw the fallback instead); this only handles
 * the network case and the final fallback so it's not duplicated per catch.
 */
export function friendlyActionError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return "We couldn't reach the server. Please check your connection and try again.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
