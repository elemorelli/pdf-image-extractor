import { spawn } from 'node:child_process';

const env = { ...process.env, DATA_DIR: process.env.DATA_DIR || './data' };

const frontend = spawn('node', ['scripts/build-frontend.js', '--watch'], { stdio: 'inherit', env });
const backend = spawn('node', ['--watch', '--watch-path=server', 'server/index.ts'], {
  stdio: 'inherit',
  env,
});

let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  frontend.kill();
  backend.kill();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
frontend.on('exit', shutdown);
backend.on('exit', shutdown);
