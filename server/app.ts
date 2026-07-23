import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import express, { type Application } from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import { isValidJobId, isValidSubfolder, isValidFilename } from './validate.ts';
import type { JobStore } from './jobStore.ts';
import type { JobRunner, AuditLogWriter } from './jobRunner.ts';

export interface CreateAppParams {
  jobStore: JobStore;
  jobRunner: JobRunner;
  auditLog: AuditLogWriter;
  maxUploadBytes?: number;
  uploadTmpDir?: string;
}

export const createApp = ({
  jobStore,
  jobRunner,
  auditLog,
  maxUploadBytes = 200 * 1024 * 1024,
  uploadTmpDir = os.tmpdir(),
}: CreateAppParams): Application => {
  const app = express();
  const upload = multer({ dest: uploadTmpDir, limits: { fileSize: maxUploadBytes } });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

  app.post('/extract', upload.single('pdf'), async (req, res) => {
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

  app.get('/status/:jobId', async (req, res) => {
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

  app.get('/jobs', async (_req, res) => {
    res.json(await jobStore.listJobs());
  });

  app.get('/jobs/:jobId', async (req, res) => {
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
    const [transparent, opaque] = await Promise.all([
      fsp.readdir(path.join(jobDir, 'transparent')).catch(() => []),
      fsp.readdir(path.join(jobDir, 'opaque')).catch(() => []),
    ]);
    res.json({ ...job, transparent, opaque });
  });

  app.get('/jobs/:jobId/files/:subfolder/:filename', (req, res) => {
    const { jobId, subfolder, filename } = req.params;
    if (!isValidJobId(jobId) || !isValidSubfolder(subfolder) || !isValidFilename(filename)) {
      res.status(404).end();
      return;
    }
    const filePath = path.join(jobStore.jobDir(jobId), subfolder, filename);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  app.get('/jobs/:jobId/download', async (req, res) => {
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

  app.delete('/jobs/:jobId', async (req, res) => {
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

  app.delete('/jobs/:jobId/files/:subfolder/:filename', async (req, res) => {
    const { jobId, subfolder, filename } = req.params;
    if (!isValidJobId(jobId) || !isValidSubfolder(subfolder) || !isValidFilename(filename)) {
      res.status(404).end();
      return;
    }
    const job = await jobStore.getJob(jobId);
    if (!job) {
      res.status(404).end();
      return;
    }
    if (job.status !== 'done') {
      res.status(409).json({ error: 'Job is not done yet' });
      return;
    }

    await fsp.rm(path.join(jobStore.jobDir(jobId), subfolder, filename), { force: true });

    const countKey = subfolder === 'transparent' ? 'transparentCount' : 'opaqueCount';
    const currentCount = job[countKey] || 0;
    await jobStore.updateJob(jobId, { [countKey]: Math.max(0, currentCount - 1) });

    res.status(204).end();
  });

  return app;
};
