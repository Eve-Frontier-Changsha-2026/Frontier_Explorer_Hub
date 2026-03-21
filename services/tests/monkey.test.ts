import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { getTestDb } from '../src/db/client.js';
import { handleIntelSubmitted } from '../src/indexer/handlers.js';
import { aggregateHeatmap, getHeatmapData, makeCellKey } from '../src/aggregator/pipeline.js';
import { saveCursor, getCursor } from '../src/indexer/cursor.js';
import { createApp } from '../src/api/server.js';
import type { IntelSubmittedEvent } from '../src/types/index.js';

const FUTURE = Date.now() + 86_400_000;

/** Insert intel with future expiry for aggregation tests */
function insertIntelRaw(
  db: Database.Database, id: string, reporter: string,
  opts: { regionId?: number; sectorX?: number; zoomLevel?: number; intelType?: number; severity?: number } = {},
) {
  db.prepare(`
    INSERT OR IGNORE INTO intel_reports
      (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level, intel_type, severity, timestamp, expiry, visibility)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 0)
  `).run(id, reporter, opts.regionId ?? 1, opts.sectorX ?? 0, opts.zoomLevel ?? 0,
    opts.intelType ?? 0, opts.severity ?? 5, Date.now(), FUTURE);
}

/**
 * Monkey tests: extreme inputs, edge cases, boundary values, crash scenarios
 */

describe('Indexer Monkey Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('duplicate intel_id only creates one row', () => {
    const event: IntelSubmittedEvent = {
      intelId: '0xDUPE', reporter: '0xA',
      location: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
      intelType: 0, severity: 5, timestamp: Date.now(), visibility: 0,
    };
    handleIntelSubmitted(db, event);
    handleIntelSubmitted(db, event);
    handleIntelSubmitted(db, event);

    const count = db.prepare('SELECT COUNT(*) as cnt FROM intel_reports WHERE intel_id = ?')
      .get('0xDUPE') as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it('handler does not crash on max u64-like severity', () => {
    handleIntelSubmitted(db, {
      intelId: '0xMAX_SEV', reporter: '0xA',
      location: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
      intelType: 0, severity: Number.MAX_SAFE_INTEGER, timestamp: Date.now(), visibility: 0,
    });
    const row = db.prepare('SELECT severity FROM intel_reports WHERE intel_id = ?')
      .get('0xMAX_SEV') as { severity: number };
    expect(row.severity).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('handler does not crash on empty string fields', () => {
    handleIntelSubmitted(db, {
      intelId: '', reporter: '',
      location: { regionId: 0, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
      intelType: 0, severity: 0, timestamp: 0, visibility: 0,
    });
    const row = db.prepare("SELECT * FROM intel_reports WHERE intel_id = ''").get();
    expect(row).toBeDefined();
  });

  it('cursor handles max values', () => {
    saveCursor(db, '0x' + 'f'.repeat(64), Number.MAX_SAFE_INTEGER);
    const cursor = getCursor(db);
    expect(cursor.cursorEvent).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('cursor overwrite does not create extra rows', () => {
    for (let i = 0; i < 100; i++) {
      saveCursor(db, `0xTX_${i}`, i);
    }
    const count = db.prepare('SELECT COUNT(*) as cnt FROM event_cursor').get() as { cnt: number };
    expect(count.cnt).toBe(1);
    const cursor = getCursor(db);
    expect(cursor.cursorEvent).toBe(99);
  });
});

describe('Aggregator Monkey Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('aggregation on empty DB does not crash', () => {
    expect(() => aggregateHeatmap(db, 3)).not.toThrow();
    const results = getHeatmapData(db, { zoomLevel: 0 }, 'premium');
    expect(results).toEqual([]);
  });

  it('single reporter below K threshold → cell suppressed', () => {
    insertIntelRaw(db, '0xLONE', '0xSOLO');
    aggregateHeatmap(db, 3);
    const results = getHeatmapData(db, { zoomLevel: 0 }, 'premium');
    expect(results.length).toBe(0);
  });

  it('K=1 means no suppression', () => {
    insertIntelRaw(db, '0xK1', '0xONE');
    aggregateHeatmap(db, 1);
    const results = getHeatmapData(db, { zoomLevel: 0 }, 'premium');
    expect(results.length).toBe(1);
  });

  it('expired intel is purged during aggregation', () => {
    // Insert intel already expired
    db.prepare(`
      INSERT INTO intel_reports (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level, intel_type, severity, timestamp, expiry, visibility)
      VALUES ('0xEXPIRED', '0xA', 1, 0, 0, 0, 0, 0, 5, ?, ?, 0)
    `).run(Date.now() - 200000, Date.now() - 100000);

    aggregateHeatmap(db, 1);

    const row = db.prepare("SELECT * FROM intel_reports WHERE intel_id = '0xEXPIRED'").get();
    expect(row).toBeUndefined(); // Should be purged
  });

  it('makeCellKey handles negative-like large numbers', () => {
    const key = makeCellKey(0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 2);
    expect(key).toContain(String(Number.MAX_SAFE_INTEGER));
  });

  it('massive batch of intel from same reporter only counts as 1 unique reporter', () => {
    for (let i = 0; i < 50; i++) {
      insertIntelRaw(db, `0xSPAM_${i}`, '0xSPAMMER', { regionId: 7, severity: 1 });
    }
    aggregateHeatmap(db, 1);
    const results = getHeatmapData(db, { zoomLevel: 0 }, 'premium');
    expect(results.length).toBe(1);
    expect(results[0]!.totalReports).toBe(50);
    expect(results[0]!.reporterCount).toBe(1);
  });
});

describe('API Monkey Tests', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = getTestDb();
    app = createApp({ db });
  });

  it('invalid zoom level string returns 400', async () => {
    const res = await request(app).get('/api/heatmap/abc');
    expect(res.status).toBe(400);
  });

  it('negative zoom level returns 400', async () => {
    const res = await request(app).get('/api/heatmap/-1');
    expect(res.status).toBe(400);
  });

  it('zoom level 99 returns 400', async () => {
    const res = await request(app).get('/api/heatmap/99');
    expect(res.status).toBe(400);
  });

  it('expired JWT defaults to free tier (not error)', async () => {
    // Craft an expired JWT — server should not crash, just default to free
    const res = await request(app)
      .get('/api/heatmap/0')
      .set('Authorization', 'Bearer expired.invalid.token');
    expect(res.status).toBe(200);
  });

  it('malformed Authorization header defaults to free tier', async () => {
    const res = await request(app)
      .get('/api/heatmap/0')
      .set('Authorization', 'NotBearer xyz');
    expect(res.status).toBe(200);
  });

  it('very long intel_id returns 404 (not crash)', async () => {
    const longId = '0x' + 'a'.repeat(1000);
    const res = await request(app).get(`/api/intel/${longId}`);
    expect(res.status).toBe(404);
  });

  it('SQL injection attempt in intel_id returns 404', async () => {
    const res = await request(app).get("/api/intel/'; DROP TABLE intel_reports; --");
    expect(res.status).toBe(404);

    // Verify table still exists
    const count = db.prepare('SELECT COUNT(*) as cnt FROM intel_reports').get() as { cnt: number };
    expect(count.cnt).toBe(0); // Table exists, just empty
  });

  it('SQL injection attempt in regionId returns data or error, not crash', async () => {
    const res = await request(app).get("/api/region/1 OR 1=1/summary");
    expect([200, 400, 404]).toContain(res.status);
  });

  it('concurrent requests do not crash rate limiter', async () => {
    const promises = Array.from({ length: 20 }, () =>
      request(app).get('/api/health')
    );
    const results = await Promise.all(promises);
    // Some should succeed, some might get rate limited — none should crash
    for (const r of results) {
      expect([200, 429]).toContain(r.status);
    }
  });

  it('empty body on subscription status returns result', async () => {
    const res = await request(app).get('/api/subscription/status');
    expect(res.status).toBe(200);
  });

  it('bounties returns empty array even with query params', async () => {
    const res = await request(app).get('/api/bounties/active?region=1&type=0&limit=100');
    expect(res.status).toBe(200);
    expect(res.body.bounties).toEqual([]);
  });
});
