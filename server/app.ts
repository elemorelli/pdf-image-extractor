import express, { Router, type Application } from 'express';
import os from 'node:os';
import path from 'node:path';
import type { AuditLogWriter, JobRunner } from './jobRunner.ts';
import type { JobStore } from './jobStore.ts';
import {
  createConfigRoute,
  createDownloadRoute,
  createExtractRoute,
  createJobFilesRoute,
  createJobsRoute,
  createPagesRoute,
  createStatusRoute,
} from './routes/index.ts';

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

  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  const publicDir = path.join(import.meta.dirname, '..', 'public');

  app.use(createPagesRoute({ publicDir }));
  app.use(express.static(publicDir));

  const apiRouter = Router();

  apiRouter.use(createConfigRoute({ maxUploadBytes }));
  apiRouter.use(
    createExtractRoute({ jobStore, jobRunner, auditLog, maxUploadBytes, uploadTmpDir }),
  );
  apiRouter.use(createStatusRoute({ jobStore, jobRunner }));
  apiRouter.use('/jobs', createJobsRoute({ jobStore, jobRunner, auditLog }));
  apiRouter.use('/jobs', createJobFilesRoute({ jobStore }));
  apiRouter.use('/jobs', createDownloadRoute({ jobStore }));

  app.use('/api', apiRouter);

  return app;
};
