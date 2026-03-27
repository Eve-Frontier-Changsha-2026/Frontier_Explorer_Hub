import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../src/db/client.js';
import { WorldAggregator } from '../src/aggregator/world-aggregator.js';
import type Database from 'better-sqlite3';

describe('WorldAggregator', () => {
  let db: Database.Database;
  let aggregator: WorldAggregator;
  const now = Date.now();

  beforeEach(() => {
    db = getTestDb();
    aggregator = new WorldAggregator(db, 600_000);

    // Seed EVE EYES activity
    db.prepare(
      `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 4.2, 2.1, 6.8, 23, now - 300000, now, now);

    // Seed Utopia data
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xk1', '0xa', 'sun', '0xb', 'moon', '0xa', 'sun', 'SHIP', 30013131, now - 1000, 1, now);

    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xk2', '0xc', 'jw01', '0xd', 'yuntao', '0xd', 'yuntao', 'SHIP', 30002618, now - 2000, 1, now);

    db.prepare(
      `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xchar1', 'sun', '0xaddr1', 1000167, 'Clonebank 86', 'CO86', now - 90000000, now);

    db.prepare(
      `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xchar2', 'new_player', '0xaddr2', 1000167, 'Clonebank 86', 'CO86', now - 1000, now);

    db.prepare(
      `INSERT INTO utopia_assemblies (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xasm1', 'ONLINE', '0xa', 'sun', '', 88092, now, now);

    db.prepare(
      `INSERT INTO utopia_assemblies (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xasm2', 'OFFLINE', '0xa', 'sun', '', 88092, now, now);

    db.prepare(
      `INSERT INTO utopia_tribes (id, name, name_short, description, member_count, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(1000167, 'Clonebank 86', 'CO86', '', 150, now - 86400000, now);

    db.prepare(
      `INSERT INTO utopia_tribes (id, name, name_short, description, member_count, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(98000011, 'BIBA CORP', 'BIBA', '', 2, now - 50000, now);
  });

  it('aggregate returns correct union of both sources', () => {
    const status = aggregator.aggregate();
    expect(status.players.registered).toBe(2);
    expect(status.players.active).toBe(23);
    expect(status.players.sources).toHaveLength(2);
    expect(status.combat.kills24h).toBe(2);
    expect(status.combat.activeSystems).toBe(2);
    expect(status.combat.recentKills).toHaveLength(2);
    expect(status.combat.recentKills[0].killerName).toBe('sun');
    expect(status.infrastructure.onlineAssemblies).toBe(1);
    expect(status.infrastructure.totalAssemblies).toBe(2);
    expect(status.infrastructure.infraIndex).toBe(2.1);
    expect(status.defense.defenseIndex).toBe(4.2);
    expect(status.traffic.trafficIndex).toBe(6.8);
    expect(status.factions.count).toBe(2);
    expect(status.factions.largest.ticker).toBe('CO86');
    expect(status.factions.largest.members).toBe(150);
  });

  it('aggregate marks stale when data is old', () => {
    db.prepare('DELETE FROM region_activity').run();
    db.prepare(
      `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 1, 1, 1, 5, now - 900000, now - 700000, now - 700000);

    const status = aggregator.aggregate();
    const eeSource = status.defense.sources.find((s) => s.provider === 'eve-eyes');
    expect(eeSource?.stale).toBe(true);
  });

  it('aggregate works with no EVE EYES data', () => {
    db.prepare('DELETE FROM region_activity').run();
    const status = aggregator.aggregate();
    expect(status.defense.defenseIndex).toBe(0);
    expect(status.defense.sources).toHaveLength(0);
    expect(status.players.active).toBe(0);
    expect(status.players.registered).toBe(2);
  });

  it('aggregate works with no Utopia data', () => {
    db.prepare('DELETE FROM utopia_killmails').run();
    db.prepare('DELETE FROM utopia_characters').run();
    db.prepare('DELETE FROM utopia_assemblies').run();
    db.prepare('DELETE FROM utopia_tribes').run();
    const status = aggregator.aggregate();
    expect(status.combat.kills24h).toBe(0);
    expect(status.players.registered).toBe(0);
    expect(status.defense.defenseIndex).toBe(4.2);
  });

  it('aggregate writes to world_status_cache', () => {
    aggregator.aggregate();
    const row = db.prepare('SELECT * FROM world_status_cache WHERE id = 1').get() as { status_json: string } | undefined;
    expect(row).toBeDefined();
    const cached = JSON.parse(row!.status_json);
    expect(cached.combat.kills24h).toBe(2);
  });

  it('newLast24h counts only recent characters', () => {
    const status = aggregator.aggregate();
    expect(status.players.newLast24h).toBe(1);
  });
});
