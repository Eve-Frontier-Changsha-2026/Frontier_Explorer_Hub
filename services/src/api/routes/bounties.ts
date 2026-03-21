import { Router } from 'express';

export function createBountiesRouter(): Router {
  const router = Router();

  // TODO: integrate with bounty indexer when available
  router.get('/bounties/active', (_req, res) => {
    res.json({ bounties: [] });
  });

  return router;
}
