import path from 'node:path';
import { Router } from 'express';
import { requireValidJobId } from '../routeHelpers.ts';

export interface PagesRouteDeps {
  publicDir: string;
}

// Serves the HTML shell for each client-rendered page. The page's own
// script reads any state it needs (e.g. the job id) from the URL.
export const createPagesRoute = ({ publicDir }: PagesRouteDeps): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  router.get('/jobs', (_req, res) => {
    res.sendFile(path.join(publicDir, 'jobs.html'));
  });

  router.get('/jobs/:jobId', requireValidJobId, (_req, res) => {
    res.sendFile(path.join(publicDir, 'job.html'));
  });

  return router;
};
