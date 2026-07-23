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
  const expired = jobs.filter((job) => now - Date.parse(job.uploadedAt) > maxAgeMs);

  await Promise.all(expired.map((job) => jobStore.deleteJob(job.jobId)));

  return expired.map((job) => job.jobId);
};
