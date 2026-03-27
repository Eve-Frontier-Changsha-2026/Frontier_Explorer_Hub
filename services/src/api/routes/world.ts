import { Router } from 'express';
import type Database from 'better-sqlite3';
import { WorldAggregator } from '../../aggregator/world-aggregator.js';
import { getUtopiaClient } from '../../utopia/client.js';
import { config } from '../../config.js';

const HEX_ID_RE = /^0x[a-f0-9]{64}$/;
const NUMERIC_ID_RE = /^\d+$/;

export function createWorldRouter(db: Database.Database): Router {
  const router = Router();
  const aggregator = new WorldAggregator(db, config.worldStalenessMs);

  // ── Aggregated world status ──
  router.get('/world/status', (_req, res) => {
    const status = aggregator.aggregate();
    res.json(status);
  });

  // ── Detail proxy routes ──

  router.get('/world/character/:id', async (req, res) => {
    const { id } = req.params;
    if (!HEX_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid character ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getCharacterDetail(id);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch character from Utopia' });
    }
  });

  router.get('/world/character/:id/kills', async (req, res) => {
    const { id } = req.params;
    if (!HEX_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid character ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getCharacterKills(id);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch kills from Utopia' });
    }
  });

  router.get('/world/assembly/:id', async (req, res) => {
    const { id } = req.params;
    if (!HEX_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid assembly ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getAssemblyDetail(id);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch assembly from Utopia' });
    }
  });

  router.get('/world/tribe/:id', async (req, res) => {
    const { id } = req.params;
    if (!NUMERIC_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid tribe ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getTribeDetail(parseInt(id, 10));
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch tribe from Utopia' });
    }
  });

  return router;
}
