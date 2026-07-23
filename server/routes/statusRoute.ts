import { Router } from 'express';
import { isValidJobId } from '../validate.ts';
import type { JobStore } from '../jobStore.ts';
import type { JobRunner, ProgressEvent, DoneEvent } from '../jobRunner.ts';

const HEARTBEAT_MS = 15000;

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

  router.get('/status/:jobId/stream', async (req, res) => {
    const { jobId } = req.params;

    if (!isValidJobId(jobId)) {
      res.status(404).end();

      return;
    }

    const live = jobRunner.getLiveProgress(jobId);
    const job = live ? null : await jobStore.getJob(jobId);

    if (!live && !job) {
      res.status(404).end();

      return;
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const sendEvent = (data: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      jobRunner.events.off('progress', onProgress);
      jobRunner.events.off('done', onDone);
    };

    const onProgress = (payload: ProgressEvent): void => {
      if (payload.jobId !== jobId) {
        return;
      }

      sendEvent({ stage: payload.stage, item: payload.item, done: false, error: null });
    };

    const onDone = (payload: DoneEvent): void => {
      if (payload.jobId !== jobId) {
        return;
      }

      sendEvent({ stage: null, item: null, done: true, error: payload.error });
      cleanup();
      res.end();
    };

    jobRunner.events.on('progress', onProgress);
    jobRunner.events.on('done', onDone);
    req.on('close', cleanup);

    if (job && (job.status === 'done' || job.status === 'error')) {
      onDone({ jobId, error: job.status === 'error' ? (job.error ?? null) : null });

      return;
    }

    if (live) {
      sendEvent({ stage: live.stage, item: live.item, done: false, error: null });
    }
  });

  return router;
};
