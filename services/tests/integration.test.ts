import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { getTestDb } from '../src/db/client.js';
import { handleSubscriptionCreated, handleIntelUnlocked } from '../src/indexer/handlers.js';
import { aggregateHeatmap, getHeatmapData } from '../src/aggregator/pipeline.js';
import type { SubscriptionCreatedEvent, IntelUnlockedEvent } from '../src/types/index.js';

const FUTURE = Date.now() + 86_400_000; // 24h from now

/** Helper: insert intel directly with a future expiry (handler defaults expiry=0 which gets purged) */
function insertIntel(
  db: Database.Database,
  id: string,
  reporter: string,
  opts: { regionId?: number; sectorX?: number; zoomLevel?: number; intelType?: number; severity?: number; visibility?: number } = {},
) {
  db.prepare(`
    INSERT OR IGNORE INTO intel_reports
      (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level, intel_type, severity, timestamp, expiry, visibility)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
  `).run(
    id, reporter,
    opts.regionId ?? 1, opts.sectorX ?? 0, opts.zoomLevel ?? 0,
    opts.intelType ?? 0, opts.severity ?? 5,
    Date.now(), FUTURE, opts.visibility ?? 0,
  );
}

describe('Full Pipeline Integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('ingested intel appears in heatmap after aggregation', () => {
    insertIntel(db, '0xINTEL_1', '0xREPORTER_A', { regionId: 42, sectorX: 10, intelType: 1 });
    insertIntel(db, '0xINTEL_2', '0xREPORTER_B', { regionId: 42, sectorX: 10, intelType: 1 });
    insertIntel(db, '0xINTEL_3', '0xREPORTER_C', { regionId: 42, sectorX: 10, intelType: 1 });

    aggregateHeatmap(db, 3);

    const results = getHeatmapData(db, { zoomLevel: 0 }, 'premium');
    expect(results.length).toBe(1);
    expect(results[0]!.totalReports).toBe(3);
    expect(results[0]!.reporterCount).toBe(3);
    expect(results[0]!.suppressed).toBe(false);
    expect(results[0]!.avgSeverity).toBe(5);
  });

  it('free tier only sees zoom 0-1 with delayed data', () => {
    insertIntel(db, '0xZ0', '0xA');
    insertIntel(db, '0xZ0_2', '0xB');
    insertIntel(db, '0xZ0_3', '0xC');
    insertIntel(db, '0xZ2', '0xD', { zoomLevel: 2, severity: 7 });

    aggregateHeatmap(db, 1);

    const freeZ0 = getHeatmapData(db, { zoomLevel: 0 }, 'free');
    expect(freeZ0.length).toBeGreaterThan(0);
    expect(freeZ0[0]!.byType).toBeNull();
    expect(freeZ0[0]!.avgSeverity).toBeNull();

    const freeZ2 = getHeatmapData(db, { zoomLevel: 2 }, 'free');
    expect(freeZ2.length).toBe(0);
  });

  it('subscription upgrade changes tier query result', () => {
    const addr = '0xUSER_UPGRADE';
    const tier1 = db.prepare('SELECT * FROM subscriptions WHERE subscriber = ?').get(addr);
    expect(tier1).toBeUndefined();

    const sub: SubscriptionCreatedEvent = {
      subscriptionId: '0xSUB_UP',
      subscriber: addr,
      tier: 1,
      expiresAt: Date.now() + 86400000,
    };
    handleSubscriptionCreated(db, sub);

    const row = db.prepare('SELECT * FROM subscriptions WHERE subscriber = ?').get(addr) as { tier: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.tier).toBe(1);
  });

  it('unlock receipt links buyer to intel', () => {
    insertIntel(db, '0xINTEL_LOCKED', '0xREPORTER', { visibility: 1 });

    const unlock: IntelUnlockedEvent = {
      receiptId: '0xRECEIPT_1',
      buyer: '0xBUYER',
      intelId: '0xINTEL_LOCKED',
      pricePaid: 100_000_000,
      reporterShare: 70_000_000,
    };
    handleIntelUnlocked(db, unlock);

    const receipt = db.prepare('SELECT * FROM unlock_receipts WHERE intel_id = ? AND buyer = ?')
      .get('0xINTEL_LOCKED', '0xBUYER') as { price_paid: number } | undefined;
    expect(receipt).toBeDefined();
    expect(receipt!.price_paid).toBe(100_000_000);
  });

  it('region summary combines heatmap and activity data', () => {
    for (let i = 0; i < 5; i++) {
      insertIntel(db, `0xR99_${i}`, `0xR_${i}`, { regionId: 99, sectorX: i, intelType: i % 4, severity: i + 1 });
    }
    aggregateHeatmap(db, 1);

    db.prepare(`
      INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end)
      VALUES (99, 12.5, 8.3, 5.1, 42, ?, ?)
    `).run(Date.now() - 300000, Date.now());

    const heatmap = getHeatmapData(db, { zoomLevel: 0, regionId: 99 }, 'premium');
    expect(heatmap.length).toBeGreaterThan(0);

    const activity = db.prepare('SELECT * FROM region_activity WHERE region_id = ? ORDER BY window_end DESC LIMIT 1')
      .get(99) as { active_players: number } | undefined;
    expect(activity).toBeDefined();
    expect(activity!.active_players).toBe(42);
  });
});
