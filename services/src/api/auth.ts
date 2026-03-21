import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import type { AuthPayload, SubscriptionTier } from '../types/index.js';

// Module augmentation for Express.Request
declare global {
  namespace Express {
    interface Request {
      auth: AuthPayload;
    }
  }
}

const ANONYMOUS_AUTH: AuthPayload = {
  address: 'anonymous',
  tier: 'free',
  expiresAt: 0,
};

export function verifyAuth(req: Request): AuthPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      address: string;
      expiresAt?: number;
    };
    return {
      address: decoded.address,
      tier: 'free', // will be resolved by middleware
      expiresAt: decoded.expiresAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function getTier(db: Database.Database, address: string): SubscriptionTier {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT tier, expires_at FROM subscriptions
       WHERE subscriber = ? AND tier = 1 AND expires_at > ?
       ORDER BY expires_at DESC LIMIT 1`,
    )
    .get(address, now) as { tier: number; expires_at: number } | undefined;
  return row ? 'premium' : 'free';
}

export function createAuthMiddleware(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const payload = verifyAuth(req);
    if (!payload) {
      req.auth = ANONYMOUS_AUTH;
    } else {
      payload.tier = getTier(db, payload.address);
      req.auth = payload;
    }
    next();
  };
}
