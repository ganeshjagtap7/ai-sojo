import { z } from 'zod';
import { runSearchPipeline } from '@/lib/pipeline/searchPipeline';
import { bucketsToCriteria } from '@/lib/pipeline/bucketsToCriteria';
import { isUSCountry } from '@/lib/geo';
import type { SearchCriteria } from '@/lib/types';
import type { Archetype, Buckets, Facts } from '@/lib/flow/types';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, refundRateLimit } from '@/lib/ratelimit';
import { toFriendlyError, NO_RESULTS } from '@/lib/errors/friendly';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

// Normalizing (never-throwing) schema for the final criteria. Caller-supplied
// `body.criteria` and the refine-time override are untyped JSON — a missing
// `location.country` or a string where a number belongs would otherwise crash
// deep inside the pipeline (e.g. router.ts calls `country.trim()`) instead of
// being coerced at the boundary. Field-level `.catch` fixes bad values; the
// group-level `.catch` fixes missing/bad groups.
const nullableNum = z.number().finite().nullable().catch(null);
const CriteriaSchema = z.object({
  location: z.object({
    city: z.string().catch(''),
    state: z.string().catch(''),
    country: z.string().catch('US'),
    radiusMiles: z.number().finite().catch(50),
  }).catch({ city: '', state: '', country: 'US', radiusMiles: 50 }),
  industry: z.object({
    primary: z.string().catch(''),
    subSectors: z.array(z.string()).catch([]),
    keywords: z.array(z.string()).catch([]),
  }).catch({ primary: '', subSectors: [], keywords: [] }),
  businessSize: z.object({
    revenueMin: nullableNum,
    revenueMax: nullableNum,
    employeeMin: nullableNum,
    employeeMax: nullableNum,
  }).catch({ revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null }),
  preferences: z.object({
    businessAgeYears: nullableNum,
    ownerOperated: z.boolean().nullable().catch(null),
    disqualifiers: z.array(z.string()).catch([]),
  }).catch({ businessAgeYears: null, ownerOperated: null, disqualifiers: [] }),
  searcherType: z.enum(['traditional', 'self_funded', 'aspiring', 'unknown']).catch('unknown'),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Parse and validate BEFORE the rate-limit check — a malformed request must
  // not burn one of the user's scarce daily search slots.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let criteria: SearchCriteria;
  if (body.criteria) {
    // Field-level .catch means this only fails when criteria isn't an object.
    const parsed = CriteriaSchema.safeParse(body.criteria);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid criteria' }, { status: 400 });
    }
    criteria = parsed.data;
  } else if (body.buckets && body.facts) {
    criteria = bucketsToCriteria({
      archetype: (body.archetype ?? null) as Archetype | null,
      facts: body.facts as Facts,
      buckets: body.buckets as Buckets,
    });
  } else {
    return Response.json({ error: 'Missing criteria or buckets+facts' }, { status: 400 });
  }

  // Merge a refine-time override on top of the base thesis criteria.
  // Shallow merge per top-level group so a partial industry override doesn't
  // wipe location, etc.
  if (body.criteriaOverride && typeof body.criteriaOverride === 'object') {
    const o = body.criteriaOverride as Partial<SearchCriteria>;
    criteria = CriteriaSchema.parse({
      ...criteria,
      location: { ...criteria.location, ...(o.location ?? {}) },
      industry: { ...criteria.industry, ...(o.industry ?? {}) },
      businessSize: { ...criteria.businessSize, ...(o.businessSize ?? {}) },
      preferences: { ...criteria.preferences, ...(o.preferences ?? {}) },
      searcherType: o.searcherType ?? criteria.searcherType,
    });
  }

  // Industry is always required. A city is required for US searches (the US
  // local-business sources search by city), but a country-level search abroad
  // (e.g. "manufacturing in India") is valid — its deal/directory sources route
  // on country, not city.
  const loc = criteria.location;
  if (!criteria.industry?.primary || (!loc?.city && isUSCountry(loc?.country))) {
    return Response.json(
      { error: isUSCountry(loc?.country) ? 'City and industry are required' : 'Industry is required' },
      { status: 400 },
    );
  }

  const { allowed } = await checkRateLimit(user.id, 'search');
  if (!allowed) {
    return Response.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  // Stream the pipeline's progress to the client over SSE. The pipeline still
  // runs to completion in a single request (30–90s, under maxDuration: 300);
  // the stream just surfaces phase-by-phase progress so the UI can show a live
  // label, then a terminal result or error event. The 401/429 gates above
  // already returned plain JSON before we ever open this stream.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        const { leads, metadata } = await runSearchPipeline(criteria, (e) =>
          send({ type: 'progress', ...e }),
        );
        send({ type: 'result', leads, metadata });
      } catch (err) {
        const { userMessage, logDetail } = toFriendlyError(err);
        console.error('[/api/search]', logDetail);
        // Refund the quota slot when the failure is ours (scraper/model/etc.).
        // NOT for NO_RESULTS: the pipeline ran end-to-end and spent the full
        // compute budget, it just found nothing — that legitimately uses a slot.
        const ranButEmpty = err instanceof Error && err.message === NO_RESULTS;
        if (!ranButEmpty) await refundRateLimit(user.id, 'search');
        send({ type: 'error', errorText: userMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
