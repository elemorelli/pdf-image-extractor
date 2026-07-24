import { createStream } from 'rotating-file-stream';

export interface AuditLog {
  log(event: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

export const createAuditLog = (dir: string): AuditLog => {
  const stream = createStream('app.log', {
    interval: '1d',
    maxFiles: 7,
    path: dir,
  });

  const log = (event: Record<string, unknown>): Promise<void> => {
    const line = JSON.stringify({ time: new Date().toISOString(), ...event });

    return new Promise((resolve, reject) => {
      stream.write(line + '\n', (err) => (err ? reject(err) : resolve()));
    });
  };

  const close = (): Promise<void> => new Promise((resolve) => stream.end(resolve));

  return { log, close };
};
