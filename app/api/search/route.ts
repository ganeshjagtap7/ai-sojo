import { runSearchPipeline } from '@/lib/pipeline/searchPipeline';
import { bucketsToCriteria } from '@/lib/pipeline/bucketsToCriteria';
import type { SearchCriteria } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/ratelimit';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(user.id);
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
      location: { ...criteria.location, ...(o.location ?? {}) },
      industry: { ...criteria.industry, ...(o.industry ?? {}) },
      businessSize: { ...criteria.businessSize, ...(o.businessSize ?? {}) },
      preferences: { ...criteria.preferences, ...(o.preferences ?? {}) },
      searcherType: o.searcherType ?? criteria.searcherType,
    };
  }

  if (!criteria.location?.city || !criteria.industry?.primary) {
    return Response.json({ error: 'City and industry are required' }, { status: 400 });
  }

  // Run the pipeline synchronously and return the full result. Takes 30–90s
  // typically, well under maxDuration: 300. The previous async + jobStore
  // model broke on Vercel because each serverless instance had its own
  // in-memory Map, so /status polls usually missed the job.
  try {
    const result = await runSearchPipeline(criteria);
    return Response.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search pipeline failed';
    console.error('[/api/search] pipeline error:', err);
    return Response.json({ error: message }, { status: 500 });
  }
}
