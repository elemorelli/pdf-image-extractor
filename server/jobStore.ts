import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface Job {
  jobId: string;
  originalName: string;
  uploadedAt: string;
  status: string;
  webp: boolean;
  error?: string;
  transparentCount?: number;
  opaqueCount?: number;
}

export interface NewJobParams {
  originalName: string;
  webp: boolean;
}

export interface JobStore {
  jobDir(jobId: string): string;
  createJob(params: NewJobParams): Promise<string>;
  getJob(jobId: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;
  updateJob(jobId: string, patch: Partial<Omit<Job, 'jobId'>>): Promise<Job>;
  deleteJob(jobId: string): Promise<void>;
}

const isEnoent = (err: unknown): boolean =>
  err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';

export const createJobStore = (baseDir: string): JobStore => {
  const jobDir = (jobId: string): string => path.join(baseDir, jobId);

  const metadataPath = (jobId: string): string => path.join(jobDir(jobId), 'metadata.json');

  const createJob = async ({ originalName, webp }: NewJobParams): Promise<string> => {
    const jobId = crypto.randomUUID();
    await fs.mkdir(jobDir(jobId), { recursive: true });
    const metadata: Omit<Job, 'jobId'> = {
      originalName,
      uploadedAt: new Date().toISOString(),
      status: 'processing',
      webp: Boolean(webp),
    };
    await fs.writeFile(metadataPath(jobId), JSON.stringify(metadata, null, 2));
    return jobId;
  };

  const getJob = async (jobId: string): Promise<Job | null> => {
    try {
      const raw = await fs.readFile(metadataPath(jobId), 'utf8');
      return { jobId, ...JSON.parse(raw) };
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  };

  const listJobs = async (): Promise<Job[]> => {
    let entries;
    try {
      entries = await fs.readdir(baseDir, { withFileTypes: true });
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
    const jobs: Job[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const job = await getJob(entry.name);
      if (job) jobs.push(job);
    }
    jobs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return jobs;
  };

  const updateJob = async (jobId: string, patch: Partial<Omit<Job, 'jobId'>>): Promise<Job> => {
    const current = await getJob(jobId);
    if (!current) throw new Error(`No such job: ${jobId}`);
    const { jobId: _omit, ...rest } = current;
    const updated = { ...rest, ...patch };
    await fs.writeFile(metadataPath(jobId), JSON.stringify(updated, null, 2));
    return { jobId, ...updated };
  };

  const deleteJob = async (jobId: string): Promise<void> => {
    await fs.rm(jobDir(jobId), { recursive: true, force: true });
  };

  return { jobDir, createJob, getJob, listJobs, updateJob, deleteJob };
};
