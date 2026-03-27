import { config } from './config.js';
import { getDb, closeDb } from './db/client.js';
import { getEveEyesClient } from './eve-eyes/client.js';
import { SuiClient } from '@mysten/sui/client';
import { startServer } from './api/server.js';

// Lazy imports — these modules are built by other tracks
async function tryImport<T>(path: string): Promise<T | null> {
  try {
    return (await import(path)) as T;
  } catch {
    return null;
  }
}

async function main() {
  const db = getDb();
  const suiClient = new SuiClient({ url: config.suiRpcUrl });
  const eveEyesClient = getEveEyesClient();

  // Start event indexer (Track B)
  const indexerMod = await tryImport<{
    EventIndexer: new (...args: unknown[]) => { start(): void; stop(): void };
  }>('./indexer/event-listener.js');
  let indexer: { start(): void; stop(): void } | null = null;
  if (indexerMod) {
    indexer = new indexerMod.EventIndexer(db, suiClient);
    indexer.start();
    console.log('[main] EventIndexer started');
  } else {
    console.log('[main] EventIndexer not available (Track B)');
  }

  // Start aggregation scheduler (Track C)
  const aggMod = await tryImport<{
    AggregationScheduler: new (...args: unknown[]) => { start(): void; stop(): void };
  }>('./aggregator/scheduler.js');
  let scheduler: { start(): void; stop(): void } | null = null;
  if (aggMod) {
    scheduler = new aggMod.AggregationScheduler(db, {
      kAnonymityThreshold: config.kAnonymityThreshold,
      aggregationIntervalMs: config.aggregationIntervalMs,
    });
    scheduler.start();
    console.log('[main] AggregationScheduler started');
  } else {
    console.log('[main] AggregationScheduler not available (Track C)');
  }

  // Start activity tracker (Track E sub-module)
  const trackerMod = await tryImport<{
    ActivityTracker: new (...args: unknown[]) => { start(): void; stop(): void };
  }>('./eve-eyes/activity-tracker.js');
  let tracker: { start(): void; stop(): void } | null = null;
  if (trackerMod) {
    tracker = new trackerMod.ActivityTracker(db, eveEyesClient);
    tracker.start();
    console.log('[main] ActivityTracker started');
  } else {
    console.log('[main] ActivityTracker not available');
  }

  // Start Utopia tracker
  const utopiaTrackerMod = await tryImport<{
    UtopiaTracker: new (...args: unknown[]) => { start(): void; stop(): void; onPollComplete?: () => void };
  }>('./utopia/tracker.js');
  let utopiaTracker: { start(): void; stop(): void; onPollComplete?: () => void } | null = null;

  // World aggregator — runs after either tracker polls
  const worldAggMod = await tryImport<{
    WorldAggregator: new (...args: unknown[]) => { aggregate(): unknown };
  }>('./aggregator/world-aggregator.js');
  let worldAggregator: { aggregate(): unknown } | null = null;

  if (worldAggMod) {
    worldAggregator = new worldAggMod.WorldAggregator(db);
    console.log('[main] WorldAggregator ready');
  }

  if (utopiaTrackerMod) {
    utopiaTracker = new utopiaTrackerMod.UtopiaTracker(db);
    if (worldAggregator) {
      utopiaTracker.onPollComplete = () => {
        try { worldAggregator!.aggregate(); } catch (e) { console.error('[main] WorldAggregator error:', e); }
      };
    }
    utopiaTracker.start();
    console.log('[main] UtopiaTracker started');
  } else {
    console.log('[main] UtopiaTracker not available');
  }

  // Start HTTP server
  const server = startServer({ db, suiClient });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[main] Shutting down...');
    server.close();
    indexer?.stop();
    scheduler?.stop();
    tracker?.stop();
    utopiaTracker?.stop();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
