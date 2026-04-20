import { jobStore } from '@/lib/pipeline/jobStore';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = jobStore.get(jobId);

  if (!job) {
    return Response.json({ error: 'Job not found or expired' }, { status: 404 });
  }

  if (job.status === 'complete') {
    return Response.json({
      jobId,
      status: 'complete',
      resultCount: job.results?.length ?? 0,
    });
  }

  if (job.status === 'failed') {
    return Response.json({ jobId, status: 'failed', error: job.error });
  }

  return Response.json({ jobId, status: 'processing', progress: job.progress });
}
