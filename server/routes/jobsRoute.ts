import path from 'node:path';
import fsp from 'node:fs/promises';
import { Router } from 'express';
import { isValidJobId } from '../validate.ts';
import { readImageMetaForFiles } from '../imageMeta.ts';
import type { JobStore } from '../jobStore.ts';
import type { JobRunner, AuditLogWriter } from '../jobRunner.ts';

export interface JobsRouteDeps {
  jobStore: JobStore;
  jobRunner: JobRunner;
  auditLog: AuditLogWriter;
}

// Mounted at /jobs. Handles listing, single-job detail, and job
// deletion/cancellation. File-level and download routes live in their own
// route modules since they're a different concern.
export const createJobsRoute = ({ jobStore, jobRunner, auditLog }: JobsRouteDeps): Router => {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await jobStore.listJobs());
  });

  router.get('/:jobId', async (req, res) => {
    const { jobId } = req.params;

    if (!isValidJobId(jobId)) {
      res.status(404).end();

      return;
    }

    const job = await jobStore.getJob(jobId);

    if (!job) {
      res.status(404).end();

      return;
    }

    const jobDir = jobStore.jobDir(jobId);
    const [transparentFiles, opaqueFiles] = await Promise.all([
      fsp.readdir(path.join(jobDir, 'transparent')).catch(() => []),
      fsp.readdir(path.join(jobDir, 'opaque')).catch(() => []),
    ]);
    const [transparent, opaque] = await Promise.all([
      readImageMetaForFiles(path.join(jobDir, 'transparent'), transparentFiles),
      readImageMetaForFiles(path.join(jobDir, 'opaque'), opaqueFiles),
    ]);

    res.json({ ...job, transparent, opaque });
  });

  router.delete('/:jobId', async (req, res) => {
    const { jobId } = req.params;

    if (!isValidJobId(jobId)) {
      res.status(404).end();

      return;
    }

    const job = await jobStore.getJob(jobId);

    if (!job) {
      res.status(404).end();

      return;
    }

    const wasRunning = jobRunner.cancel(jobId);

    await jobStore.deleteJob(jobId);
    await auditLog.log({
      type: wasRunning ? 'cancelled' : 'deleted',
      jobId,
      originalName: job.originalName,
    });
    res.status(204).end();
  });

  return router;
};
