// Shared save-eligibility check for a thesis, used by both the /api/onboard
// route (server guard) and the client (Stage6Deliver / onboarding handoff) so
// the "don't persist a contentless thesis" rule lives in ONE testable place.
//
// Issue #11: theses were being saved with facts={} buckets={} even though a
// Stage-5 paragraph existed — leaving a thesis with no criteria behind it, so
// downstream searches ran with no industry/location. This guard rejects that.

export type ThesisSaveStatus = 'saveable' | 'no-thesis' | 'empty-answers';

interface ThesisLike {
  paragraph?: string;
}

/**
 * Decide whether a captured flow-state slice can be persisted as a thesis.
 *  - 'no-thesis'     → nothing was generated yet (treat as a no-op, not an error)
 *  - 'empty-answers' → a thesis exists but NO facts and NO buckets were captured
 *                      (issue #11 — refuse; the row would be unusable downstream)
 *  - 'saveable'      → has a paragraph AND at least one of facts/buckets
 */
export function thesisSaveStatus(
  facts: Record<string, unknown> | null | undefined,
  buckets: Record<string, unknown> | null | undefined,
  thesis: ThesisLike | null | undefined,
): ThesisSaveStatus {
  if (!thesis || !thesis.paragraph) return 'no-thesis';
  const factsEmpty = !facts || Object.keys(facts).length === 0;
  const bucketsEmpty = !buckets || Object.keys(buckets).length === 0;
  if (factsEmpty && bucketsEmpty) return 'empty-answers';
  return 'saveable';
}
