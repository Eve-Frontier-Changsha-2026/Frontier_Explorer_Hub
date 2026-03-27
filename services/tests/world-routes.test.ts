import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  db = getTestDb();
  app = createApp({ db });

  const now = Date.now();

  // Seed EVE EYES
  db.prepare(
    `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(null, 4.2, 2.1, 6.8, 23, now - 300000, now, now);

  // Seed Utopia killmails
  db.prepare(
    `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('0xk1', '0xa', 'sun', '0xb', 'moon', '0xa', 'sun', 'SHIP', 30013131, now - 1000, 1, now);

  // Seed Utopia characters
  db.prepare(
    `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('0xc1', 'sun', '0xaddr1', 1000167, 'CO86', 'CO86', now - 3600000, now);

  // Seed assemblies
  db.prepare(
    `INSERT INTO utopia_assemblies (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('0xa1', 'ONLINE', '0xa', 'sun', '', 88092, now, now);

  // Seed tribes
  db.prepare(
    `INSERT INTO utopia_tribes (id, name, name_short, description, member_count, created_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1000167, 'Clonebank 86', 'CO86', '', 150, now - 86400000, now);
});

afterAll(() => {
  db.close();
});

describe('GET /api/world/status', () => {
  it('returns aggregated world status', async () => {
    const res = await request(app).get('/api/world/status');
    expect(res.status).toBe(200);
    expect(res.body.players.registered).toBe(1);
    expect(res.body.players.active).toBe(23);
    expect(res.body.combat.kills24h).toBe(1);
    expect(res.body.combat.recentKills).toHaveLength(1);
    expect(res.body.infrastructure.onlineAssemblies).toBe(1);
    expect(res.body.defense.defenseIndex).toBe(4.2);
    expect(res.body.factions.count).toBe(1);
    expect(res.body.factions.largest.ticker).toBe('CO86');
    expect(res.body.updatedAt).toBeGreaterThan(0);
  });

  it('includes source metadata', async () => {
    const res = await request(app).get('/api/world/status');
    expect(res.body.players.sources.length).toBeGreaterThan(0);
    const providers = res.body.players.sources.map((s: { provider: string }) => s.provider);
    expect(providers).toContain('utopia');
    expect(providers).toContain('eve-eyes');
  });
});

describe('ID validation on proxy routes', () => {
  it('rejects invalid hex id for character', async () => {
    const res = await request(app).get('/api/world/character/not-a-hex-id');
    expect(res.status).toBe(400);
  });

  it('rejects invalid tribe id', async () => {
    const res = await request(app).get('/api/world/tribe/not-a-number');
    expect(res.status).toBe(400);
  });

  it('accepts valid hex id format', async () => {
    const validId = '0x' + 'a'.repeat(64);
    const res = await request(app).get(`/api/world/character/${validId}`);
    expect(res.status).not.toBe(400);
  });
});
