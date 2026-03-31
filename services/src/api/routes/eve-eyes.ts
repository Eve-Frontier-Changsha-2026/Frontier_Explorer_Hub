import { Router } from 'express';
import { getEveEyesClient } from '../../eve-eyes/client.js';
import { RouteCache } from '../middleware/route-cache.js';

const NUMERIC_RE = /^\d+$/;
const CACHE_60S = 60_000;
const CACHE_30S = 30_000;

export function createEveEyesRouter(): Router {
  const router = Router();
  const cache = new RouteCache();
  const client = getEveEyesClient();

  router.get('/eve-eyes/killmails', async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const status = req.query.status as string | undefined;
    const cacheKey = `killmails:${limit}:${status}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getKillmails(limit, status);
      cache.set(cacheKey, data, CACHE_60S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch killmails from EVE EYES' });
    }
  });

  router.get('/eve-eyes/leaderboard', async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const moduleName = req.query.moduleName as string | undefined;
    const cacheKey = `leaderboard:${limit}:${moduleName}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getLeaderboard(limit, moduleName as never);
      cache.set(cacheKey, data, CACHE_60S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch leaderboard from EVE EYES' });
    }
  });

  router.get('/eve-eyes/modules-summary', async (_req, res) => {
    const cached = cache.get('modules-summary');
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getModulesSummary();
      cache.set('modules-summary', data, CACHE_60S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch modules summary from EVE EYES' });
    }
  });

  router.get('/eve-eyes/systems/search', async (req, res) => {
    const q = req.query.q as string;
    if (!q) { res.status(400).json({ error: 'Missing q parameter' }); return; }
    const cacheKey = `systems-search:${q}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.searchSystems(q);
      cache.set(cacheKey, data, CACHE_30S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to search systems' });
    }
  });

  router.get('/eve-eyes/systems/:id', async (req, res) => {
    const { id } = req.params;
    if (!NUMERIC_RE.test(id)) { res.status(400).json({ error: 'System ID must be numeric' }); return; }
    const cacheKey = `system:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getSystemDetail(parseInt(id, 10));
      cache.set(cacheKey, data, CACHE_30S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch system detail' });
    }
  });

  router.get('/eve-eyes/route', async (req, res) => {
    const originId = req.query.originId as string;
    const destinationId = req.query.destinationId as string;
    if (!originId || !destinationId || !NUMERIC_RE.test(originId) || !NUMERIC_RE.test(destinationId)) {
      res.status(400).json({ error: 'originId and destinationId are required (numeric)' });
      return;
    }
    const cacheKey = `route:${originId}:${destinationId}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getRoute(parseInt(originId, 10), parseInt(destinationId, 10));
      cache.set(cacheKey, data, CACHE_30S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to compute route' });
    }
  });

  router.get('/eve-eyes/tx/:digest', async (req, res) => {
    try {
      const data = await client.getTransactionBlockDetail(req.params.digest);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch transaction detail' });
    }
  });

  router.get('/eve-eyes/tx/:digest/move-calls', async (req, res) => {
    try {
      const data = await client.getTransactionMoveCalls(
        req.params.digest,
        req.query.includeActionSummary === '1',
      );
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch move calls' });
    }
  });

  router.get('/eve-eyes/move-call/:txDigest/:callIndex', async (req, res) => {
    const { txDigest, callIndex } = req.params;
    if (!NUMERIC_RE.test(callIndex)) { res.status(400).json({ error: 'callIndex must be numeric' }); return; }
    try {
      const data = await client.getMoveCallDetail(txDigest, parseInt(callIndex, 10));
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch move call detail' });
    }
  });

  return router;
}
