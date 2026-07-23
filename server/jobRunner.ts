import { spawn, type ChildProcess } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseProgressLine } from './progressParser.ts';
import type { JobStore } from './jobStore.ts';

export interface AuditLogWriter {
  log(event: Record<string, unknown>): Promise<void>;
}

export interface StartParams {
  pdfPath: string;
  webp: boolean;
  originalName: string;
}

export interface LiveProgress {
  stage: string | null;
  item: string | null;
}

export interface JobRunner {
  start(jobId: string, params: StartParams): void;
  getLiveProgress(jobId: string): LiveProgress | null;
  cancel(jobId: string): boolean;
}

interface LiveEntry {
  stage: string | null;
  item: string | null;
  child: ChildProcess;
}

const readdirSafe = async (dir: string): Promise<string[]> => {
  try {
    return await fsp.readdir(dir);
  } catch {
    return [];
  }
};

export const createJobRunner = (
  jobStore: JobStore,
  auditLog: AuditLogWriter,
  scriptPath: string,
): JobRunner => {
  const live = new Map<string, LiveEntry>();

  const start = (jobId: string, { pdfPath, webp, originalName }: StartParams): void => {
    const outdir = jobStore.jobDir(jobId);
    const args: string[] = [];

    if (webp) {
      args.push('--webp');
    }

    args.push('--outdir', outdir, pdfPath);

    const child = spawn(scriptPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    live.set(jobId, { stage: null, item: null, child });

    let stdoutBuffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');

      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const progress = parseProgressLine(line.trim());

        if (!progress) {
          continue;
        }

        const entry = live.get(jobId);

        if (!entry) {
          continue;
        }

        entry.stage = progress.stage;
        entry.item =
          progress.done !== undefined && progress.total !== undefined
            ? `${progress.done}/${progress.total}`
            : null;
      }
    });

    let stderrTail = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });

    child.on('close', async (code) => {
      live.delete(jobId);
      const [transparent, opaque] = await Promise.all([
        readdirSafe(path.join(outdir, 'transparent')),
        readdirSafe(path.join(outdir, 'opaque')),
      ]);

      await fsp.rm(pdfPath, { force: true });

      if (code === 0) {
        await jobStore.updateJob(jobId, {
          status: 'done',
          transparentCount: transparent.length,
          opaqueCount: opaque.length,
        });
        await auditLog.log({ type: 'done', jobId, originalName });
      } else {
        const lastLine =
          stderrTail.trim().split('\n').filter(Boolean).pop() || `exited with code ${code}`;

        await jobStore.updateJob(jobId, { status: 'error', error: lastLine });
        await auditLog.log({ type: 'error', jobId, originalName, error: lastLine });
      }
    });
  };

  const getLiveProgress = (jobId: string): LiveProgress | null => {
    const entry = live.get(jobId);

    if (!entry) {
      return null;
    }

    return { stage: entry.stage, item: entry.item };
  };

  const cancel = (jobId: string): boolean => {
    const entry = live.get(jobId);

    if (!entry) {
      return false;
    }

    entry.child.kill('SIGTERM');
    live.delete(jobId);

    return true;
  };

  return { start, getLiveProgress, cancel };
};
