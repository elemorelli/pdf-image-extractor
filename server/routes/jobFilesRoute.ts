import path from 'node:path';
import fsp from 'node:fs/promises';
import { Router } from 'express';
import { isValidJobId, isValidSubfolder, isValidFilename } from '../validate.ts';
import { getJobOrNotFound } from '../routeHelpers.ts';
import type { JobStore } from '../jobStore.ts';

export interface JobFilesRouteDeps {
  jobStore: JobStore;
}

// Mounted at /jobs. Handles serving and deleting individual extracted
// images within a job's transparent/opaque subfolders.
export const createJobFilesRoute = ({ jobStore }: JobFilesRouteDeps): Router => {
  const router = Router();

  router.get('/:jobId/files/:subfolder/:filename', (req, res) => {
    const { jobId, subfolder, filename } = req.params;

    if (!isValidJobId(jobId) || !isValidSubfolder(subfolder) || !isValidFilename(filename)) {
      res.status(404).end();

      return;
    }

    const filePath = path.join(jobStore.jobDir(jobId), subfolder, filename);

    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).end();
      }
    });
  });

  router.delete('/:jobId/files/:subfolder/:filename', async (req, res) => {
    const { jobId, subfolder, filename } = req.params;

    if (!isValidJobId(jobId) || !isValidSubfolder(subfolder) || !isValidFilename(filename)) {
      res.status(404).end();

      return;
    }

    const job = await getJobOrNotFound(jobStore, jobId, res);

    if (!job) {
      return;
    }

    if (job.status !== 'done') {
      res.status(409).json({ error: 'Job is not done yet' });

      return;
    }

    const filePath = path.join(jobStore.jobDir(jobId), subfolder, filename);
    const stat = await fsp.stat(filePath).catch(() => null);

    await fsp.rm(filePath, { force: true });

    const countKey = subfolder === 'transparent' ? 'transparentCount' : 'opaqueCount';
    const currentCount = job[countKey] || 0;
    const currentTotalSize = job.totalSize || 0;

    await jobStore.updateJob(jobId, {
      [countKey]: Math.max(0, currentCount - 1),
      totalSize: Math.max(0, currentTotalSize - (stat?.size ?? 0)),
    });

    res.status(204).end();
  });

  return router;
};
