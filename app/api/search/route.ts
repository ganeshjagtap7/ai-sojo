import { nanoid } from 'nanoid';
import { jobStore } from '@/lib/pipeline/jobStore';
import { runSearchPipeline } from '@/lib/pipeline/searchPipeline';
import { bucketsToCriteria } from '@/lib/pipeline/bucketsToCriteria';
import type { SearchCriteria } from '@/lib/types';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function POST(req: Request) {
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

  if (!criteria.location?.city || !criteria.industry?.primary) {
    return Response.json({ error: 'City and industry are required' }, { status: 400 });
  }

  const jobId = `srch_${nanoid(12)}`;
  jobStore.create(jobId, criteria);

  runSearchPipeline(jobId, criteria).catch((err) => {
    jobStore.fail(jobId, err instanceof Error ? err.message : 'Unknown error');
  });

  return Response.json({ jobId, status: 'processing', estimatedSeconds: 60 }, { status: 202 });
}
