const PREFIX = '##PROGRESS##';

export interface ProgressUpdate {
  stage: string;
  done?: number;
  total?: number;
}

export const parseProgressLine = (line: unknown): ProgressUpdate | null => {
  if (typeof line !== 'string') {
    return null;
  }

  // The shell scripts write a human-readable `\r`-based counter immediately
  // before each ##PROGRESS## line with no newline in between, so on the wire
  // they arrive as one line: "<counter text>##PROGRESS##{...}". The prefix
  // isn't necessarily at index 0 — find it wherever it lands.
  const prefixIndex = line.lastIndexOf(PREFIX);

  if (prefixIndex === -1) {
    return null;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(line.slice(prefixIndex + PREFIX.length));
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

  if (typeof p.done === 'number') {
    result.done = p.done;
  }

  if (typeof p.total === 'number') {
    result.total = p.total;
  }

  return result;
};
