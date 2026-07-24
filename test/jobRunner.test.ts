import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJobStore, type Job, type JobStore } from '../server/jobStore.ts';
import { createJobRunner } from '../server/jobRunner.ts';

const writeFakeScript = (body: string): string => {
  const scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fake-script-')), 'run.sh');

  fs.writeFileSync(scriptPath, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });

  return scriptPath;
};

const makeFakeAuditLog = () => {
  const events: Record<string, unknown>[] = [];

  return {
    events,
    log: async (event: Record<string, unknown>): Promise<void> => {
      events.push(event);
    },
  };
};

const makeTempPdfPath = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-pdf-'));
  const pdfPath = path.join(dir, 'input.pdf');

  fs.writeFileSync(pdfPath, 'fake pdf bytes');

  return pdfPath;
};

const waitForJobToFinish = async (jobStore: JobStore, jobId: string): Promise<Job> => {
  for (;;) {
    const job = await jobStore.getJob(jobId);

    if (job && job.status !== 'processing') {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test('start() streams progress, marks job done, and deletes the input pdf', async () => {
  const jobStore = createJobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-store-')));
  const auditLog = makeFakeAuditLog();
  const scriptPath = writeFakeScript(
    'echo \'##PROGRESS##{"stage":"extract","done":1,"total":2}\'\n' +
      'sleep 0.05\n' +
      'echo \'##PROGRESS##{"stage":"extract","done":2,"total":2}\'\n' +
      'exit 0',
  );
  const runner = createJobRunner(jobStore, auditLog, scriptPath);
  const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
  const pdfPath = makeTempPdfPath();

  runner.start(jobId, { pdfPath, webp: false, originalName: 'x.pdf' });

  const job = await waitForJobToFinish(jobStore, jobId);

  assert.equal(job.status, 'done');
  assert.equal(auditLog.events.at(-1)?.type, 'done');
  assert.equal(runner.getLiveProgress(jobId), null);
  assert.ok(!fs.existsSync(pdfPath));
});

test('start() marks job error with the last stderr line on failure', async () => {
  const jobStore = createJobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-store-')));
  const auditLog = makeFakeAuditLog();
  const scriptPath = writeFakeScript('echo "boom" >&2\nexit 1');
  const runner = createJobRunner(jobStore, auditLog, scriptPath);
  const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
  const pdfPath = makeTempPdfPath();

  runner.start(jobId, { pdfPath, webp: false, originalName: 'x.pdf' });

  const job = await waitForJobToFinish(jobStore, jobId);

  assert.equal(job.status, 'error');
  assert.equal(job.error, 'boom');
});

test('cancel() kills a running job and eventually clears its live progress', async () => {
  const jobStore = createJobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-store-')));
  const auditLog = makeFakeAuditLog();
  const scriptPath = writeFakeScript('sleep 5');
  const runner = createJobRunner(jobStore, auditLog, scriptPath);
  const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
  const pdfPath = makeTempPdfPath();

  runner.start(jobId, { pdfPath, webp: false, originalName: 'x.pdf' });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(runner.cancel(jobId), true);

  for (;;) {
    if (runner.getLiveProgress(jobId) === null) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
});

test('cancel() does not crash when the job dir is deleted before the process exits', async () => {
  const jobStore = createJobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-store-')));
  const auditLog = makeFakeAuditLog();
  const scriptPath = writeFakeScript('sleep 5');
  const runner = createJobRunner(jobStore, auditLog, scriptPath);
  const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
  const pdfPath = makeTempPdfPath();

  const doneEvents: unknown[] = [];

  runner.events.on('done', (payload) => doneEvents.push(payload));

  runner.start(jobId, { pdfPath, webp: false, originalName: 'x.pdf' });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(runner.cancel(jobId), true);
  // Mirrors what DELETE /jobs/:id does right away, without waiting for the
  // killed process to actually exit.
  await jobStore.deleteJob(jobId);

  for (;;) {
    if (doneEvents.length > 0) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.deepEqual(doneEvents, [{ jobId, error: 'cancelled' }]);
});

test('start() emits progress and done events over jobRunner.events', async () => {
  const jobStore = createJobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-store-')));
  const auditLog = makeFakeAuditLog();
  const scriptPath = writeFakeScript(
    'echo \'##PROGRESS##{"stage":"extract","done":1,"total":2}\'\n' + 'exit 0',
  );
  const runner = createJobRunner(jobStore, auditLog, scriptPath);
  const jobId = await jobStore.createJob({ originalName: 'x.pdf', webp: false });
  const pdfPath = makeTempPdfPath();

  const progressEvents: unknown[] = [];
  const doneEvents: unknown[] = [];

  runner.events.on('progress', (payload) => progressEvents.push(payload));
  runner.events.on('done', (payload) => doneEvents.push(payload));

  runner.start(jobId, { pdfPath, webp: false, originalName: 'x.pdf' });

  await waitForJobToFinish(jobStore, jobId);

  assert.deepEqual(progressEvents, [{ jobId, stage: 'extract', progress: { done: 1, total: 2 } }]);
  assert.deepEqual(doneEvents, [{ jobId, error: null }]);
});

test('cancel() returns false for a job that is not running', () => {
  const jobStore = createJobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jobrunner-store-')));
  const auditLog = makeFakeAuditLog();
  const runner = createJobRunner(jobStore, auditLog, '/bin/true');

  assert.equal(runner.cancel('nonexistent'), false);
});
