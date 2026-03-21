import { Router } from 'express';
import type Database from 'better-sqlite3';

export function createSubscriptionRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/subscription/status', (req, res) => {
    const address = req.auth.address;

    if (address === 'anonymous') {
      res.json({ tier: 'free', active: false, subscription: null });
      return;
    }

    const row = db
      .prepare(
        `SELECT subscription_id, subscriber, tier, started_at, expires_at
         FROM subscriptions
         WHERE subscriber = ?
         ORDER BY expires_at DESC LIMIT 1`,
      )
      .get(address) as
      | { subscription_id: string; subscriber: string; tier: number; started_at: number; expires_at: number }
      | undefined;

    if (!row) {
      res.json({ tier: 'free', active: false, subscription: null });
      return;
    }

    const active = row.tier === 1 && row.expires_at > Date.now();
    res.json({
      tier: active ? 'premium' : 'free',
      active,
      subscription: {
        subscriptionId: row.subscription_id,
        tier: row.tier,
        startedAt: row.started_at,
        expiresAt: row.expires_at,
      },
    });
  });

  return router;
}
