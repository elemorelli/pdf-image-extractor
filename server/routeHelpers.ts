import type { RequestHandler, Response } from 'express';
import { isValidJobId } from './validate.ts';
import type { Job, JobStore } from './jobStore.ts';

// Shared by every route mounted under /:jobId: reject malformed ids before
// touching the job store, so route bodies only ever see a well-formed id.
// Typed to the single-param shape every call site's route path produces, so
// TypeScript doesn't have to widen req.params on the handlers after it.
export const requireValidJobId: RequestHandler<{ jobId: string }> = (req, res, next) => {
  if (!isValidJobId(req.params.jobId)) {
    res.status(404).end();

    return;
  }

  next();
};

// Loads a job or writes the 404 itself, mirroring the requireValidJobId
// pattern for the "job doesn't exist" case that route bodies otherwise
// have to check for by hand every time they need the job.
export const getJobOrNotFound = async (
  jobStore: JobStore,
  jobId: string,
  res: Response,
): Promise<Job | null> => {
  const job = await jobStore.getJob(jobId);

  if (!job) {
    res.status(404).end();
  }

  return job;
};
