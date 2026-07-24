import { Router } from 'express';

export interface ConfigRouteDeps {
  maxUploadBytes: number;
}

export const createConfigRoute = ({ maxUploadBytes }: ConfigRouteDeps): Router => {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.json({ maxUploadBytes });
  });

  return router;
};
