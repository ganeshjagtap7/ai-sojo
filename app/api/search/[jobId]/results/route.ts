import { jobStore } from '@/lib/pipeline/jobStore';

export const maxDuration = 300;
export const preferredRegion = 'iad1';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = jobStore.get(jobId);

  if (!job) {
    return Response.json({ error: 'Job not found or expired' }, { status: 404 });
  }

  if (job.status === 'processing') {
    return Response.json({ status: 'processing' }, { status: 202 });
  }

  if (job.status === 'failed') {
    return Response.json({ error: job.error }, { status: 500 });
  }

  return Response.json({
    jobId,
    criteria: job.criteria,
    leads: job.results,
    metadata: job.metadata,
  });
}
