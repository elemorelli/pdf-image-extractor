import path from 'node:path';
import express, { Router } from 'express';
import { ZipArchive } from 'archiver';
import { isValidSubfolder, isValidFilename } from '../validate.ts';
import { requireValidJobId, getJobOrNotFound } from '../routeHelpers.ts';
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

const stripPdfExtension = (name: string): string => name.replace(/\.pdf$/i, '');

// Mounted at /jobs.
export const createDownloadRoute = ({ jobStore }: DownloadRouteDeps): Router => {
  const router = Router();

  router.get('/:jobId/download', requireValidJobId, async (req, res) => {
    const { jobId } = req.params;
    const job = await getJobOrNotFound(jobStore, jobId, res);

    if (!job) {
      return;
    }

    res.attachment(`${stripPdfExtension(job.originalName)}.zip`);
    const archive = new ZipArchive();

    archive.pipe(res);
    const jobDir = jobStore.jobDir(jobId);

    archive.directory(path.join(jobDir, 'transparent'), 'transparent');
    archive.directory(path.join(jobDir, 'opaque'), 'opaque');
    await archive.finalize();
  });

  router.post('/:jobId/download', requireValidJobId, express.json(), async (req, res) => {
    const { jobId } = req.params;
    const job = await getJobOrNotFound(jobStore, jobId, res);

    if (!job) {
      return;
    }

    const requested = Array.isArray(req.body?.files) ? req.body.files : [];
    const files = requested.filter(isSelectedFile);

    if (files.length === 0) {
      res.status(400).json({ error: 'No valid files specified' });

      return;
    }

    res.attachment(`${stripPdfExtension(job.originalName)}-selected.zip`);
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
