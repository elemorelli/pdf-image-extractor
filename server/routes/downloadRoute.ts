import path from 'node:path';
import { Router } from 'express';
import { ZipArchive } from 'archiver';
import { isValidJobId } from '../validate.ts';
import type { JobStore } from '../jobStore.ts';

export interface DownloadRouteDeps {
  jobStore: JobStore;
}

// Mounted at /jobs.
export const createDownloadRoute = ({ jobStore }: DownloadRouteDeps): Router => {
  const router = Router();

  router.get('/:jobId/download', async (req, res) => {
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

    res.attachment(`${job.originalName.replace(/\.pdf$/i, '')}.zip`);
    const archive = new ZipArchive();

    archive.pipe(res);
    const jobDir = jobStore.jobDir(jobId);

    archive.directory(path.join(jobDir, 'transparent'), 'transparent');
    archive.directory(path.join(jobDir, 'opaque'), 'opaque');
    await archive.finalize();
  });

  return router;
};
