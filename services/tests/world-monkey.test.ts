import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../src/db/client.js';
import { WorldAggregator } from '../src/aggregator/world-aggregator.js';
import request from 'supertest';
import { createApp } from '../src/api/server.js';
import type Database from 'better-sqlite3';

describe('WorldAggregator monkey tests', () => {
  let db: Database.Database;
  let aggregator: WorldAggregator;

  beforeEach(() => {
    db = getTestDb();
    aggregator = new WorldAggregator(db);
  });

  it('handles completely empty database', () => {
    const status = aggregator.aggregate();
    expect(status.players.registered).toBe(0);
    expect(status.players.active).toBe(0);
    expect(status.combat.kills24h).toBe(0);
    expect(status.combat.recentKills).toEqual([]);
    expect(status.infrastructure.onlineAssemblies).toBe(0);
    expect(status.defense.defenseIndex).toBe(0);
    expect(status.factions.count).toBe(0);
    expect(status.factions.largest.name).toBe('');
  });

  it('handles killmails with future timestamps', () => {
    const future = Date.now() + 999999999;
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xfuture', '0xa', 'future_killer', '0xb', 'victim', '0xa', 'rpt', 'SHIP', 1, future, 1, Date.now());

    const status = aggregator.aggregate();
    expect(status.combat.recentKills.length).toBeGreaterThanOrEqual(0);
  });

  it('handles extremely long player names', () => {
    const longName = 'x'.repeat(10000);
    db.prepare(
      `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xlong', longName, '0xaddr', 1, 'T', 'T', Date.now(), Date.now());

    const status = aggregator.aggregate();
    expect(status.players.registered).toBe(1);
  });

  it('handles thousands of killmails', () => {
    const insert = db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    const tx = db.transaction(() => {
      for (let i = 0; i < 5000; i++) {
        insert.run(`0xk${i}`, '0xa', 'killer', '0xb', 'victim', '0xa', 'rpt', 'SHIP', 30000000 + (i % 100), now - i * 1000, 1, now);
      }
    });
    tx();

    const status = aggregator.aggregate();
    expect(status.combat.recentKills).toHaveLength(5); // capped at 5
    expect(status.combat.activeSystems).toBeLessThanOrEqual(100);
  });

  it('handles negative indices from EVE EYES', () => {
    db.prepare(
      `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, -1.5, -0.3, -2.0, -5, Date.now(), Date.now(), Date.now());

    const status = aggregator.aggregate();
    expect(status.defense.defenseIndex).toBe(-1.5);
  });
});

describe('World routes monkey tests', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = getTestDb();
    app = createApp({ db });
  });

  it('rejects SQL injection in character ID', async () => {
    const res = await request(app).get("/api/world/character/'; DROP TABLE utopia_characters; --");
    expect(res.status).toBe(400);
  });

  it('rejects path traversal in assembly ID', async () => {
    // URL path normalization collapses ../../etc/passwd → the route is never reached (404),
    // or the route validates and returns 400 — either way the traversal is blocked.
    const res = await request(app).get('/api/world/assembly/../../etc/passwd');
    expect([400, 404]).toContain(res.status);
  });

  it('rejects empty ID', async () => {
    const res = await request(app).get('/api/world/character/');
    expect([400, 404]).toContain(res.status);
  });

  it('handles /api/world/status with empty DB', async () => {
    const res = await request(app).get('/api/world/status');
    expect(res.status).toBe(200);
    expect(res.body.players.registered).toBe(0);
    expect(res.body.combat.recentKills).toEqual([]);
  });

  it('rejects tribe ID with decimal', async () => {
    const res = await request(app).get('/api/world/tribe/3.14');
    expect(res.status).toBe(400);
  });

  it('rejects negative tribe ID', async () => {
    const res = await request(app).get('/api/world/tribe/-1');
    expect(res.status).toBe(400);
  });
});
