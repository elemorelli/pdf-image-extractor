const PREFIX = '##PROGRESS##';

export interface ProgressUpdate {
  stage: string;
  done?: number;
  total?: number;
}

export function parseProgressLine(line: unknown): ProgressUpdate | null {
  if (typeof line !== 'string' || !line.startsWith(PREFIX)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(line.slice(PREFIX.length));
  } catch {
    return null;
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>).stage !== 'string'
  ) {
    return null;
  }

  const p = payload as { stage: string; done?: unknown; total?: unknown };
  const result: ProgressUpdate = { stage: p.stage };
  if (typeof p.done === 'number') result.done = p.done;
  if (typeof p.total === 'number') result.total = p.total;
  return result;
}
