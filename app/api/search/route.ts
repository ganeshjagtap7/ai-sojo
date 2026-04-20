import { nanoid } from 'nanoid';
import { jobStore } from '@/lib/pipeline/jobStore';
import { runSearchPipeline } from '@/lib/pipeline/searchPipeline';
import { SearchCriteria } from '@/lib/types';

export async function POST(req: Request) {
  const { criteria }: { criteria: SearchCriteria } = await req.json();

  if (!criteria?.location?.city || !criteria?.industry?.primary) {
    return Response.json(
      { error: 'City and industry are required' },
      { status: 400 }
    );
  }

  const jobId = `srch_${nanoid(12)}`;
  jobStore.create(jobId, criteria);

  runSearchPipeline(jobId, criteria).catch((err) => {
    jobStore.fail(jobId, err instanceof Error ? err.message : 'Unknown error');
  });

  return Response.json(
    { jobId, status: 'processing', estimatedSeconds: 60 },
    { status: 202 }
  );
}
