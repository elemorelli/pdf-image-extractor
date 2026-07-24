import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseProgressLine } from './progressParser.ts';
import { readImageMetaForFiles } from './imageMeta.ts';
import type { JobStore } from './jobStore.ts';

export interface AuditLogWriter {
  log(event: Record<string, unknown>): Promise<void>;
}

export interface StartParams {
  pdfPath: string;
  webp: boolean;
  originalName: string;
}

export interface StageProgress {
  done: number;
  total: number;
}

export interface LiveProgress {
  stage: string | null;
  progress: StageProgress | null;
}

export interface ProgressEvent {
  jobId: string;
  stage: string | null;
  progress: StageProgress | null;
}

export interface DoneEvent {
  jobId: string;
  error: string | null;
}

export interface JobRunner {
  start(jobId: string, params: StartParams): void;
  getLiveProgress(jobId: string): LiveProgress | null;
  cancel(jobId: string): boolean;
  events: EventEmitter;
}

interface LiveEntry {
  stage: string | null;
  progress: StageProgress | null;
  child: ChildProcess;
  cancelled: boolean;
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
  const events = new EventEmitter();

  // Unbounded: every job that's being watched over SSE adds a listener, and
  // concurrent job count isn't bounded by anything this emitter knows about.
  events.setMaxListeners(0);

  const start = (jobId: string, { pdfPath, webp, originalName }: StartParams): void => {
    const outdir = jobStore.jobDir(jobId);
    const args: string[] = [];

    if (webp) {
      args.push('--webp');
    }

    args.push('--outdir', outdir, pdfPath);

    const child = spawn(scriptPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    live.set(jobId, { stage: null, progress: null, child, cancelled: false });

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
        entry.progress =
          progress.done !== undefined && progress.total !== undefined
            ? { done: progress.done, total: progress.total }
            : null;
        events.emit('progress', { jobId, stage: entry.stage, progress: entry.progress });
      }
    });

    let stderrTail = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });

    child.on('close', async (code) => {
      const entry = live.get(jobId);

      live.delete(jobId);
      await fsp.rm(pdfPath, { force: true });

      // A cancelled job's directory is already gone by the time the killed
      // process actually exits (the DELETE route removes it right away, not
      // waiting for SIGTERM to land), so there's no metadata left to update.
      if (entry?.cancelled) {
        events.emit('done', { jobId, error: 'cancelled' });

        return;
      }

      const [transparent, opaque] = await Promise.all([
        readdirSafe(path.join(outdir, 'transparent')),
        readdirSafe(path.join(outdir, 'opaque')),
      ]);

      if (code === 0) {
        const [transparentMeta, opaqueMeta] = await Promise.all([
          readImageMetaForFiles(path.join(outdir, 'transparent'), transparent),
          readImageMetaForFiles(path.join(outdir, 'opaque'), opaque),
        ]);
        const totalSize = [...transparentMeta, ...opaqueMeta].reduce(
          (sum, file) => sum + file.size,
          0,
        );

        await jobStore.updateJob(jobId, {
          status: 'done',
          transparentCount: transparent.length,
          opaqueCount: opaque.length,
          totalSize,
        });
        await auditLog.log({ type: 'done', jobId, originalName });
        events.emit('done', { jobId, error: null });
      } else {
        const lastLine =
          stderrTail.trim().split('\n').filter(Boolean).pop() || `exited with code ${code}`;

        await jobStore.updateJob(jobId, { status: 'error', error: lastLine });
        await auditLog.log({ type: 'error', jobId, originalName, error: lastLine });
        events.emit('done', { jobId, error: lastLine });
      }
    });
  };

  const getLiveProgress = (jobId: string): LiveProgress | null => {
    const entry = live.get(jobId);

    if (!entry) {
      return null;
    }

    return { stage: entry.stage, progress: entry.progress };
  };

  const cancel = (jobId: string): boolean => {
    const entry = live.get(jobId);

    if (!entry) {
      return false;
    }

    entry.cancelled = true;
    entry.child.kill('SIGTERM');

    return true;
  };

  return { start, getLiveProgress, cancel, events };
};
