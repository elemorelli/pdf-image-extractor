import path from 'node:path';
import fs from 'node:fs';
import { createApp } from './app.ts';
import { createJobStore } from './jobStore.ts';
import { createJobRunner } from './jobRunner.ts';
import { createAuditLog } from './auditLog.ts';
import { sweepExpiredJobs } from './cleanup.ts';

const DATA_DIR = process.env.DATA_DIR || '/data';
const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 200;
const RETENTION_HOURS = Number(process.env.RETENTION_HOURS) || 24;
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const UPLOAD_TMP_DIR = path.join(DATA_DIR, 'uploads-tmp');

fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const jobStore = createJobStore(JOBS_DIR);
const auditLog = createAuditLog(DATA_DIR);
const scriptPath = path.join(import.meta.dirname, '..', 'pdf_extract.sh');
const jobRunner = createJobRunner(jobStore, auditLog, scriptPath);

const app = createApp({
  jobStore,
  jobRunner,
  auditLog,
  maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
  uploadTmpDir: UPLOAD_TMP_DIR,
});

setInterval(
  () => {
    sweepExpiredJobs(jobStore, { maxAgeMs: RETENTION_HOURS * 60 * 60 * 1000 }).catch((err) => {
      console.error('cleanup sweep failed', err);
    });
  },
  10 * 60 * 1000,
);

app.listen(PORT, () => {
  console.log(`pdf-image-extractor listening on :${PORT}`);
});
