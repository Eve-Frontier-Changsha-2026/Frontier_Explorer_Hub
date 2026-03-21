import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import { config } from '../src/config.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let app: ReturnType<typeof createApp>;

function makeToken(address: string): string {
  return jwt.sign({ address }, config.jwtSecret);
}

beforeAll(() => {
  db = getTestDb();
  app = createApp({ db });

  // Seed heatmap data
  db.prepare(
    `INSERT INTO heatmap_cache (cell_key, zoom_level, region_id, sector_x, sector_y, sector_z,
      total_reports, reporter_count, suppressed, by_type_json, avg_severity, latest_timestamp, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('z0-r1', 0, 1, 0, 0, 0, 5, 3, 0, '{"0":3,"1":2}', 4.5, Date.now(), Date.now());

  db.prepare(
    `INSERT INTO heatmap_cache (cell_key, zoom_level, region_id, sector_x, sector_y, sector_z,
      total_reports, reporter_count, suppressed, by_type_json, avg_severity, latest_timestamp, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('z1-r1-s1', 1, 1, 1, 0, 0, 2, 2, 0, null, 3.0, Date.now(), Date.now());

  // Seed region activity
  db.prepare(
    `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 0.8, 0.5, 0.3, 10, Date.now() - 300000, Date.now(), Date.now());

  // Seed intel reports
  db.prepare(
    `INSERT INTO intel_reports (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level,
      intel_type, severity, timestamp, expiry, visibility, deposit_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('intel-1', '0xreporter', 1, 0, 0, 0, 0, 0, 5, Date.now(), Date.now() + 86400000, 0, 100);

  db.prepare(
    `INSERT INTO intel_reports (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level,
      intel_type, severity, timestamp, expiry, visibility, deposit_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('intel-private', '0xreporter', 1, 0, 0, 0, 0, 1, 8, Date.now(), Date.now() + 86400000, 1, 500);
});

afterAll(() => {
  db.close();
});

describe('Health endpoint', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Heatmap routes', () => {
  it('free tier: zoom 2 returns 403', async () => {
    const res = await request(app).get('/api/heatmap/2');
    expect(res.status).toBe(403);
  });

  it('free tier: zoom 0 returns data', async () => {
    const res = await request(app).get('/api/heatmap/0');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('free');
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    // Free tier should not have byType or avgSeverity
    expect(res.body.data[0].byType).toBeNull();
    expect(res.body.data[0].avgSeverity).toBeNull();
  });

  it('premium tier: zoom 2 returns data with premium fields', async () => {
    const addr = '0xpremium';
    const token = makeToken(addr);
    // Seed premium subscription
    db.prepare(
      `INSERT INTO subscriptions (subscription_id, subscriber, tier, started_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('sub-1', addr, 1, Date.now(), Date.now() + 86400000);

    // Seed zoom 2 data
    db.prepare(
      `INSERT INTO heatmap_cache (cell_key, zoom_level, region_id, sector_x, sector_y, sector_z,
        total_reports, reporter_count, suppressed, by_type_json, avg_severity, latest_timestamp, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('z2-r1-s1-1', 2, 1, 1, 1, 0, 1, 1, 0, '{"0":1}', 7.0, Date.now(), Date.now());

    const res = await request(app)
      .get('/api/heatmap/2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('premium');
    expect(res.body.data[0].byType).toBeTruthy();
    expect(res.body.data[0].avgSeverity).toBe(7.0);
  });

  it('invalid zoom level returns 400', async () => {
    const res = await request(app).get('/api/heatmap/5');
    expect(res.status).toBe(400);
  });
});

describe('Intel routes', () => {
  it('nonexistent intel returns 404', async () => {
    const res = await request(app).get('/api/intel/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('public intel returns full data', async () => {
    const res = await request(app).get('/api/intel/intel-1');
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.intel.reporter).toBe('0xreporter');
  });

  it('private intel without receipt returns locked', async () => {
    const res = await request(app).get('/api/intel/intel-private');
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.intel.reporter).toBeUndefined();
  });
});

describe('Region summary', () => {
  it('returns combined heatmap + activity data', async () => {
    const res = await request(app).get('/api/region/1/summary');
    expect(res.status).toBe(200);
    expect(res.body.regionId).toBe(1);
    expect(res.body.heatmap.totalReports).toBeGreaterThan(0);
    expect(res.body.activity).toBeTruthy();
    expect(res.body.activity.activePlayers).toBe(10);
  });
});

describe('Rate limiter', () => {
  it('11th request from same address returns 429', async () => {
    // Create a fresh app with its own rate limiter state
    const freshApp = createApp({ db });
    const limit = config.freeRateLimit; // 10

    for (let i = 0; i < limit; i++) {
      const r = await request(freshApp).get('/api/health');
      expect(r.status).toBe(200);
    }

    const res = await request(freshApp).get('/api/health');
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeDefined();
  });
});

describe('Auth defaults', () => {
  it('missing auth defaults to free tier', async () => {
    const res = await request(app).get('/api/subscription/status');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('free');
    expect(res.body.active).toBe(false);
  });

  it('invalid JWT defaults to free tier (not error)', async () => {
    const res = await request(app)
      .get('/api/subscription/status')
      .set('Authorization', 'Bearer invalid-garbage-token');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('free');
  });
});

describe('Bounties', () => {
  it('returns empty array', async () => {
    const freshApp = createApp({ db });
    const res = await request(freshApp).get('/api/bounties/active');
    expect(res.status).toBe(200);
    expect(res.body.bounties).toEqual([]);
  });
});
