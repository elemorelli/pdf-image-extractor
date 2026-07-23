import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { createJobStore, type JobStore } from '../server/jobStore.ts';
import type { JobRunner, LiveProgress, StartParams } from '../server/jobRunner.ts';

export const makeFakeAuditLog = () => ({
  log: async (): Promise<void> => {},
});

// Mimics createJobRunner's real behavior (write transparent/opaque files,
// mark the job done, emit the same events) without spawning pdf_extract.sh,
// so route tests can exercise the full extract -> status -> detail flow
// (including SSE) quickly and offline.
export const makeFakeJobRunner = (jobStore: JobStore): JobRunner => {
  const events = new EventEmitter();

  return {
    start: async (jobId: string, _params: StartParams) => {
      const jobDir = jobStore.jobDir(jobId);

      await fsp.mkdir(path.join(jobDir, 'transparent'), { recursive: true });
      await fsp.mkdir(path.join(jobDir, 'opaque'), { recursive: true });
      await fsp.writeFile(path.join(jobDir, 'transparent', 'a.png'), 'fake-png');
      await jobStore.updateJob(jobId, { status: 'done', transparentCount: 1, opaqueCount: 0 });
      events.emit('done', { jobId, error: null });
    },
    getLiveProgress: (): LiveProgress | null => null,
    cancel: (): boolean => false,
    events,
  };
};

export const startTestServer = async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-test-'));
  const jobStore = createJobStore(baseDir);
  const jobRunner = makeFakeJobRunner(jobStore);
  const auditLog = makeFakeAuditLog();
  const app = createApp({ jobStore, jobRunner, auditLog });
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;

  return { server, jobStore, baseUrl: `http://127.0.0.1:${port}` };
};

interface ImageMetaSummary {
  filename: string;
  size: number;
  width?: number;
  height?: number;
}

interface JobDetail {
  status: string;
  transparent: ImageMetaSummary[];
  opaque: ImageMetaSummary[];
}

// The job runner (real or fake) processes a job asynchronously in the
// background, so tests must poll rather than assume it finished by the time
// the next request lands.
export const waitForJobDone = async (baseUrl: string, jobId: string): Promise<JobDetail> => {
  for (;;) {
    const res = await fetch(`${baseUrl}/jobs/${jobId}`);
    const detail = (await res.json()) as JobDetail;

    if (detail.status !== 'processing') {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
