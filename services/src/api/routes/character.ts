import { Router } from 'express';
import type { CharacterResolver } from '../../eve-eyes/character-resolver.js';

export function createCharacterRouter(resolver: CharacterResolver): Router {
  const router = Router();

  router.get('/character/:address', async (req, res) => {
    const { address } = req.params;
    try {
      const info = await resolver.resolve(address);
      res.json(info);
    } catch {
      res.status(500).json({ error: 'Failed to resolve character' });
    }
  });

  return router;
}
