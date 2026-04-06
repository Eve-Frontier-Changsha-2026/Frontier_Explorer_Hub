import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import request from 'supertest';
import { getTestDb } from '../src/db/client.js';
import { aggregateSystemHeatmap } from '../src/aggregator/system-heatmap.js';
import { createApp } from '../src/api/server.js';

function insertKillmail(db: Database.Database, opts: { id: string; solarSystemId: number; killedAt?: number }) {
  db.prepare(
    `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
     VALUES (?, 'k1', 'killer', 'v1', 'victim', 'r1', 'reporter', 'SHIP', ?, ?, 1, ?)`
  ).run(opts.id, opts.solarSystemId, opts.killedAt ?? Date.now(), Date.now());
}

function insertIntel(db: Database.Database, opts: { intelId: string; regionId: number; severity?: number; timestamp?: number; expiry?: number }) {
  db.prepare(
    `INSERT INTO intel_reports (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level, intel_type, severity, timestamp, expiry)
     VALUES (?, 'rep1', ?, 0, 0, 0, 0, 0, ?, ?, ?)`
  ).run(opts.intelId, opts.regionId, opts.severity ?? 5, opts.timestamp ?? Date.now(), opts.expiry ?? Date.now() + 3_600_000);
}

function getSystem(db: Database.Database, systemId: string) {
  return db.prepare('SELECT * FROM heatmap_systems WHERE system_id = ?').get(systemId) as {
    system_id: string; system_name: string; kill_count: number; intel_count: number;
    gate_traffic: number; market_activity: number; intensity: number;
  } | undefined;
}

describe('SystemHeatmapAggregator', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('aggregates killmails by solar_system_id', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k3', solarSystemId: 30004452 });

    aggregateSystemHeatmap(db);

    const sys1 = getSystem(db, '30001719');
    expect(sys1).toBeDefined();
    expect(sys1!.kill_count).toBe(2);
    expect(sys1!.system_name).toBe('ONT-MT7');

    const sys2 = getSystem(db, '30004452');
    expect(sys2).toBeDefined();
    expect(sys2!.kill_count).toBe(1);
    expect(sys2!.system_name).toBe('IN3-K3D');
  });

  it('aggregates intel reports by region_id', () => {
    insertIntel(db, { intelId: 'i1', regionId: 30001719 });
    insertIntel(db, { intelId: 'i2', regionId: 30001719 });

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.intel_count).toBe(2);
  });

  it('computes intensity = min(100, kills*20 + intel*15 + gates*5 + market*3)', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k3', solarSystemId: 30001719 });
    insertIntel(db, { intelId: 'i1', regionId: 30001719 });
    insertIntel(db, { intelId: 'i2', regionId: 30001719 });

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.intensity).toBe(90);
  });

  it('caps intensity at 100', () => {
    for (let i = 0; i < 6; i++) {
      insertKillmail(db, { id: `k${i}`, solarSystemId: 30001719 });
    }

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.intensity).toBe(100);
  });

  it('assigns placeholder name for unknown system', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 99999999 });

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '99999999');
    expect(sys!.system_name).toBe('SYS-999999');
  });

  it('upserts on repeated runs (idempotent)', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);

    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.kill_count).toBe(2);
  });

  it('returns empty result for empty tables', () => {
    aggregateSystemHeatmap(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM heatmap_systems').get() as { c: number };
    expect(count.c).toBe(0);
  });
});

describe('GET /api/heatmap/systems', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('returns empty systems when no data', async () => {
    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.status).toBe(200);
    expect(res.body.systems).toEqual([]);
    expect(res.body.links).toEqual([]);
    expect(res.body.generatedAt).toBeDefined();
  });

  it('returns aggregated systems after pipeline run', async () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);

    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.status).toBe(200);
    expect(res.body.systems).toHaveLength(1);
    expect(res.body.systems[0].systemId).toBe('30001719');
    expect(res.body.systems[0].systemName).toBe('ONT-MT7');
    expect(res.body.systems[0].killCount).toBe(2);
    expect(res.body.systems[0].intensity).toBe(40);
  });

  it('generates links between systems with shared killmail actors', async () => {
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES ('k1', 'killer_A', 'K', 'v1', 'V', 'r1', 'R', 'SHIP', 30001719, ?, 1, ?)`
    ).run(Date.now(), Date.now());
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES ('k2', 'killer_A', 'K', 'v2', 'V', 'r1', 'R', 'SHIP', 30004452, ?, 1, ?)`
    ).run(Date.now(), Date.now());
    aggregateSystemHeatmap(db);

    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.body.links.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SystemHeatmap — Monkey Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('handles MAX_SAFE_INTEGER solar_system_id gracefully', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: Number.MAX_SAFE_INTEGER });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, String(Number.MAX_SAFE_INTEGER));
    expect(sys).toBeDefined();
    expect(sys!.kill_count).toBe(1);
  });

  it('handles 0 as solar_system_id', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 0 });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '0');
    expect(sys!.system_name).toBe('SYS-0');
  });

  it('handles negative solar_system_id', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: -1 });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '-1');
    expect(sys).toBeDefined();
  });

  it('handles thousands of killmails without error', () => {
    const insert = db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, 'k', 'K', 'v', 'V', 'r', 'R', 'SHIP', ?, ?, 1, ?)`
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < 5000; i++) {
        insert.run(`k${i}`, 30001719, Date.now(), Date.now());
      }
    });
    tx();

    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '30001719');
    expect(sys!.kill_count).toBe(5000);
    expect(sys!.intensity).toBe(100);
  });

  it('expired intel reports are excluded from aggregation', () => {
    insertIntel(db, { intelId: 'i1', regionId: 30001719, expiry: Date.now() - 1000 });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '30001719');
    expect(sys).toBeUndefined();
  });

  it('concurrent aggregation runs produce consistent results', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);
    aggregateSystemHeatmap(db);
    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.kill_count).toBe(1);
    expect(sys!.intensity).toBe(20);
  });

  it('API returns valid JSON for empty database', async () => {
    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.systems)).toBe(true);
    expect(Array.isArray(res.body.links)).toBe(true);
  });
});
