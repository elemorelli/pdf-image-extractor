import { Router } from 'express';
import { isValidJobId } from '../validate.ts';
import type { JobStore } from '../jobStore.ts';
import type { JobRunner } from '../jobRunner.ts';

export interface StatusRouteDeps {
  jobStore: JobStore;
  jobRunner: JobRunner;
}

export const createStatusRoute = ({ jobStore, jobRunner }: StatusRouteDeps): Router => {
  const router = Router();

  router.get('/status/:jobId', async (req, res) => {
    const { jobId } = req.params;

    if (!isValidJobId(jobId)) {
      res.status(404).end();

      return;
    }

    const live = jobRunner.getLiveProgress(jobId);

    if (live) {
      res.json({ stage: live.stage, item: live.item, done: false, error: null });

      return;
    }

    const job = await jobStore.getJob(jobId);

    if (!job) {
      res.status(404).end();

      return;
    }

    res.json({
      stage: null,
      item: null,
      done: job.status === 'done' || job.status === 'error',
      error: job.status === 'error' ? job.error : null,
    });
  });

  return router;
};
