import express from 'express';
import cors from 'cors';
import type Database from 'better-sqlite3';
import type { SuiClient } from '@mysten/sui/client';
import { createAuthMiddleware } from './auth.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { createHeatmapRouter } from './routes/heatmap.js';
import { createIntelRouter } from './routes/intel.js';
import { createSubscriptionRouter } from './routes/subscription.js';
import { createBountiesRouter } from './routes/bounties.js';
import { createRegionRouter } from './routes/region.js';
import { createCharacterRouter } from './routes/character.js';
import { CharacterResolver } from '../eve-eyes/character-resolver.js';
import { config } from '../config.js';

// TODO: SSE endpoint — reserved for approach C upgrade
// import { createSSEStream, sseBroadcaster } from './middleware/sse.js';

export interface CreateAppOptions {
  db: Database.Database;
  suiClient?: SuiClient;
}

export function createApp(opts: CreateAppOptions): express.Express {
  const { db, suiClient } = opts;

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(createAuthMiddleware(db));
  app.use('/api', createRateLimiter());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Routes
  app.use('/api', createHeatmapRouter(db));
  app.use('/api', createIntelRouter(db));
  app.use('/api', createSubscriptionRouter(db));
  app.use('/api', createBountiesRouter(db, suiClient));
  app.use('/api', createRegionRouter(db));

  // Character route — requires sui client
  if (suiClient) {
    const resolver = new CharacterResolver(db, suiClient);
    app.use('/api', createCharacterRouter(resolver));
  }

  // TODO: SSE endpoint — reserved for approach C upgrade
  // app.get('/api/events/stream', (req, res) => {
  //   const stream = createSSEStream(res);
  //   sseBroadcaster.addClient(req.auth.address + '-' + Date.now(), res);
  //   req.on('close', () => stream.close());
  // });

  return app;
}

export function startServer(opts: CreateAppOptions): ReturnType<express.Express['listen']> {
  const app = createApp(opts);
  return app.listen(config.port, () => {
    console.log(`[server] Explorer Hub API listening on :${config.port}`);
  });
}
