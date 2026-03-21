import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { getTestDb } from '../src/db/client.js';
import {
  makeCellKey,
  aggregateHeatmap,
  getHeatmapData,
} from '../src/aggregator/pipeline.js';
import { ActivityTracker } from '../src/eve-eyes/activity-tracker.js';

// ── Helpers ──────────────────────────────────────────────────────

function insertIntel(
  db: Database.Database,
  opts: {
    intelId: string;
    reporter: string;
    regionId?: number;
    sectorX?: number;
    sectorY?: number;
    sectorZ?: number;
    zoomLevel?: number;
    intelType?: number;
    severity?: number;
    timestamp?: number;
    expiry?: number;
  },
) {
  db.prepare(
    `INSERT INTO intel_reports
      (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level,
       intel_type, severity, timestamp, expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.intelId,
    opts.reporter,
    opts.regionId ?? 1,
    opts.sectorX ?? 0,
    opts.sectorY ?? 0,
    opts.sectorZ ?? 0,
    opts.zoomLevel ?? 0,
    opts.intelType ?? 0,
    opts.severity ?? 5,
    opts.timestamp ?? Date.now(),
    opts.expiry ?? Date.now() + 3_600_000,
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('makeCellKey', () => {
  it('produces deterministic output', () => {
    const a = makeCellKey(1, 2, 3, 4, 0);
    const b = makeCellKey(1, 2, 3, 4, 0);
    expect(a).toBe(b);
    expect(a).toBe('1:2:3:4:0');
  });

  it('different inputs produce different keys', () => {
    expect(makeCellKey(1, 0, 0, 0, 0)).not.toBe(makeCellKey(2, 0, 0, 0, 0));
  });
});

describe('K-anonymity suppression', () => {
  let db: Database.Database;
  const K = 3;

  beforeEach(() => {
    db = getTestDb();
  });

  it('suppresses cells with fewer than K reporters', () => {
    // 2 reporters < K=3
    insertIntel(db, { intelId: 'a1', reporter: 'alice' });
    insertIntel(db, { intelId: 'a2', reporter: 'bob' });

    aggregateHeatmap(db, K);

    const rows = db.prepare('SELECT * FROM heatmap_cache').all() as Array<{
      suppressed: number;
      reporter_count: number;
    }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.suppressed).toBe(1);
    expect(rows[0]!.reporter_count).toBe(2);
  });

  it('does NOT suppress cells with >= K reporters', () => {
    insertIntel(db, { intelId: 'b1', reporter: 'alice' });
    insertIntel(db, { intelId: 'b2', reporter: 'bob' });
    insertIntel(db, { intelId: 'b3', reporter: 'charlie' });

    aggregateHeatmap(db, K);

    const rows = db.prepare('SELECT * FROM heatmap_cache').all() as Array<{
      suppressed: number;
      reporter_count: number;
    }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.suppressed).toBe(0);
    expect(rows[0]!.reporter_count).toBe(3);
  });
});

describe('Tier gating', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
    // Insert 3 reports (meets K=3) at zoom 0
    insertIntel(db, { intelId: 'c1', reporter: 'alice', zoomLevel: 0 });
    insertIntel(db, { intelId: 'c2', reporter: 'bob', zoomLevel: 0 });
    insertIntel(db, { intelId: 'c3', reporter: 'charlie', zoomLevel: 0 });
    aggregateHeatmap(db, 3);
  });

  it('free tier nulls out byType and avgSeverity', () => {
    const cells = getHeatmapData(db, { zoomLevel: 0 }, 'free');
    expect(cells.length).toBe(1);
    expect(cells[0]!.byType).toBeNull();
    expect(cells[0]!.avgSeverity).toBeNull();
    // basic fields still present
    expect(cells[0]!.totalReports).toBe(3);
  });

  it('premium tier gets full data', () => {
    const cells = getHeatmapData(db, { zoomLevel: 0 }, 'premium');
    expect(cells.length).toBe(1);
    expect(cells[0]!.byType).not.toBeNull();
    expect(cells[0]!.avgSeverity).not.toBeNull();
  });

  it('free tier zoom restriction: zoom 2 returns empty', () => {
    // Add zoom 2 data
    insertIntel(db, { intelId: 'd1', reporter: 'alice', zoomLevel: 2 });
    insertIntel(db, { intelId: 'd2', reporter: 'bob', zoomLevel: 2 });
    insertIntel(db, { intelId: 'd3', reporter: 'charlie', zoomLevel: 2 });
    aggregateHeatmap(db, 3);

    const cells = getHeatmapData(db, { zoomLevel: 2 }, 'free');
    expect(cells).toEqual([]);

    // Premium can access zoom 2
    const premCells = getHeatmapData(db, { zoomLevel: 2 }, 'premium');
    expect(premCells.length).toBe(1);
  });
});

describe('ActivityTracker.getLatestActivity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('returns null when no activity rows exist', () => {
    const result = ActivityTracker.getLatestActivity(db);
    expect(result).toBeNull();
  });

  it('reads the latest row from region_activity', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO region_activity
        (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 1.5, 2.0, 3.5, 42, now - 86400000, now, now);

    const result = ActivityTracker.getLatestActivity(db);
    expect(result).not.toBeNull();
    expect(result!.defenseIndex).toBe(1.5);
    expect(result!.infraIndex).toBe(2.0);
    expect(result!.trafficIndex).toBe(3.5);
    expect(result!.activePlayers).toBe(42);
  });

  it('returns the most recent row when multiple exist', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO region_activity
        (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 1.0, 1.0, 1.0, 10, now - 86400000, now - 60000, now - 60000);

    db.prepare(
      `INSERT INTO region_activity
        (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 9.9, 8.8, 7.7, 99, now - 86400000, now, now);

    const result = ActivityTracker.getLatestActivity(db);
    expect(result!.defenseIndex).toBe(9.9);
    expect(result!.activePlayers).toBe(99);
  });
});
