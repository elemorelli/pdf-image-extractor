import os from 'node:os';
import path from 'node:path';
import express, { type Application } from 'express';
import { createExtractRoute } from './routes/extractRoute.ts';
import { createStatusRoute } from './routes/statusRoute.ts';
import { createJobsRoute } from './routes/jobsRoute.ts';
import { createJobFilesRoute } from './routes/jobFilesRoute.ts';
import { createDownloadRoute } from './routes/downloadRoute.ts';
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

  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

  app.use(createExtractRoute({ jobStore, jobRunner, auditLog, maxUploadBytes, uploadTmpDir }));
  app.use(createStatusRoute({ jobStore, jobRunner }));
  app.use('/jobs', createJobsRoute({ jobStore, jobRunner, auditLog }));
  app.use('/jobs', createJobFilesRoute({ jobStore }));
  app.use('/jobs', createDownloadRoute({ jobStore }));

  return app;
};
