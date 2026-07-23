import path from 'node:path';
import fsp from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import type { JobStore } from '../jobStore.ts';
import type { JobRunner, AuditLogWriter } from '../jobRunner.ts';

export interface ExtractRouteDeps {
  jobStore: JobStore;
  jobRunner: JobRunner;
  auditLog: AuditLogWriter;
  maxUploadBytes: number;
  uploadTmpDir: string;
}

export const createExtractRoute = ({
  jobStore,
  jobRunner,
  auditLog,
  maxUploadBytes,
  uploadTmpDir,
}: ExtractRouteDeps): Router => {
  const router = Router();
  const upload = multer({ dest: uploadTmpDir, limits: { fileSize: maxUploadBytes } });

  router.post('/extract', upload.single('pdf'), async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      if (req.file) await fsp.rm(req.file.path, { force: true });
      res.status(400).json({ error: 'A .pdf file is required' });
      return;
    }
    const webp = req.body.webp === 'true' || req.body.webp === 'on';
    const jobId = await jobStore.createJob({ originalName: req.file.originalname, webp });
    const pdfPath = path.join(jobStore.jobDir(jobId), 'input.pdf');
    await fsp.rename(req.file.path, pdfPath);

    await auditLog.log({ type: 'created', jobId, originalName: req.file.originalname });
    jobRunner.start(jobId, { pdfPath, webp, originalName: req.file.originalname });

    res.json({ jobId });
  });

  return router;
};
