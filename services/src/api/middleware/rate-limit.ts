import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config.js';

interface WindowEntry {
  timestamps: number[];
}

export function createRateLimiter() {
  const windows = new Map<string, WindowEntry>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.auth?.address ?? 'anonymous';
    const tier = req.auth?.tier ?? 'free';
    const limit = tier === 'premium' ? config.premiumRateLimit : config.freeRateLimit;
    const windowMs = 60_000; // 1 minute

    const now = Date.now();
    let entry = windows.get(address);
    if (!entry) {
      entry = { timestamps: [] };
      windows.set(address, entry);
    }

    // Sliding window: remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
      const oldest = entry.timestamps[0]!;
      const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many requests', retryAfter });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}
