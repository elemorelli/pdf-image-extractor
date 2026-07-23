import type { JobStore } from './jobStore.ts';

export interface SweepOptions {
  maxAgeMs: number;
  now?: number;
}

export const sweepExpiredJobs = async (
  jobStore: JobStore,
  { maxAgeMs, now = Date.now() }: SweepOptions,
): Promise<string[]> => {
  const jobs = await jobStore.listJobs();
  const deleted: string[] = [];
  for (const job of jobs) {
    const uploadedAt = Date.parse(job.uploadedAt);
    if (now - uploadedAt > maxAgeMs) {
      await jobStore.deleteJob(job.jobId);
      deleted.push(job.jobId);
    }
  }
  return deleted;
};
