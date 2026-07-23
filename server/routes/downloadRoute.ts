import path from 'node:path';
import express, { Router } from 'express';
import { ZipArchive } from 'archiver';
import { isValidJobId, isValidSubfolder, isValidFilename } from '../validate.ts';
import type { JobStore } from '../jobStore.ts';

export interface DownloadRouteDeps {
  jobStore: JobStore;
}

interface SelectedFile {
  subfolder: string;
  filename: string;
}

const isSelectedFile = (value: unknown): value is SelectedFile =>
  typeof value === 'object' &&
  value !== null &&
  isValidSubfolder((value as Record<string, unknown>).subfolder) &&
  isValidFilename((value as Record<string, unknown>).filename);

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

  router.post('/:jobId/download', express.json(), async (req, res) => {
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

    const requested = Array.isArray(req.body?.files) ? req.body.files : [];
    const files = requested.filter(isSelectedFile);

    if (files.length === 0) {
      res.status(400).json({ error: 'No valid files specified' });

      return;
    }

    res.attachment(`${job.originalName.replace(/\.pdf$/i, '')}-selected.zip`);
    const archive = new ZipArchive();

    archive.pipe(res);
    const jobDir = jobStore.jobDir(jobId);

    for (const file of files) {
      archive.file(path.join(jobDir, file.subfolder, file.filename), {
        name: `${file.subfolder}/${file.filename}`,
      });
    }

    await archive.finalize();
  });

  return router;
};
