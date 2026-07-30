import { runSearchPipeline } from '@/lib/pipeline/searchPipeline';
import { bucketsToCriteria } from '@/lib/pipeline/bucketsToCriteria';
import { isUSCountry, mergeLocation } from '@/lib/geo';
import type { SearchCriteria } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, refundRateLimit } from '@/lib/ratelimit';
import { toFriendlyError, NO_RESULTS } from '@/lib/errors/friendly';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(user.id, 'search');
  if (!allowed) {
    return Response.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const body = await req.json();

  let criteria: SearchCriteria;
  if (body.criteria) {
    criteria = body.criteria;
  } else if (body.buckets && body.facts) {
    criteria = bucketsToCriteria({
      archetype: body.archetype ?? null,
      facts: body.facts,
      buckets: body.buckets,
    });
  } else {
    return Response.json({ error: 'Missing criteria or buckets+facts' }, { status: 400 });
  }

  // Merge a refine-time override on top of the base thesis criteria.
  // Shallow merge per top-level group so a partial industry override doesn't
  // wipe location, etc.
  if (body.criteriaOverride && typeof body.criteriaOverride === 'object') {
    const o = body.criteriaOverride as Partial<SearchCriteria>;
    criteria = {
      ...criteria,
      location: mergeLocation(criteria.location, o.location),
      industry: { ...criteria.industry, ...(o.industry ?? {}) },
      businessSize: { ...criteria.businessSize, ...(o.businessSize ?? {}) },
      preferences: { ...criteria.preferences, ...(o.preferences ?? {}) },
      searcherType: o.searcherType ?? criteria.searcherType,
    };
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

  // Stream the pipeline's progress to the client over SSE. The pipeline still
  // runs to completion in a single request (30–90s, under maxDuration: 300);
  // the stream just surfaces phase-by-phase progress so the UI can show a live
  // label, then a terminal result or error event. The 401/429 gates above
  // already returned plain JSON before we ever open this stream.

  // The buyer's own thesis words (stickiness, disqualifier, vision...) — the
  // ranker uses them to write matchReasons in the buyer's language.
  const thesisNotes = body.buckets && typeof body.buckets === 'object'
    ? Object.entries(body.buckets as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string' && v && v !== '(skipped)')
        .map(([k, v]) => `${k}: ${v as string}`)
        .join('\n')
    : '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        const { leads, metadata } = await runSearchPipeline(criteria, (e) =>
          send({ type: 'progress', ...e }),
        thesisNotes);
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
