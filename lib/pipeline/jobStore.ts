import { Job, JobProgress, RankedLead, SearchCriteria, SearchMetadata } from '@/lib/types';

class JobStore {
  private jobs = new Map<string, Job>();
  private ttl = parseInt(process.env.JOB_TTL_MS || '3600000');

  constructor() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  create(id: string, criteria: SearchCriteria): Job {
    const job: Job = {
      id,
      status: 'processing',
      criteria,
      progress: {
        step: 'starting',
        stepsCompleted: 0,
        totalSteps: 4,
        message: 'Starting search...',
      },
      results: null,
      metadata: null,
      error: null,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    return job;
  }

  get(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  updateProgress(id: string, step: string, stepsCompleted: number, totalSteps: number, message: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.progress = { step, stepsCompleted, totalSteps, message } satisfies JobProgress;
  }

  complete(id: string, results: RankedLead[], metadata: SearchMetadata): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'complete';
    job.results = results;
    job.metadata = metadata;
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'failed';
    job.error = error;
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (now - job.createdAt > this.ttl) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobStore = new JobStore();
