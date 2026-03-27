import type Database from 'better-sqlite3';
import type { WorldStatus, SourceMeta, KillEntry } from '../types/index.js';

interface ActivityRow {
  defense_index: number;
  infra_index: number;
  traffic_index: number;
  active_players: number;
  updated_at: number;
}

interface KillRow {
  id: string;
  killer_name: string;
  killer_id: string;
  victim_name: string;
  victim_id: string;
  loss_type: string;
  solar_system_id: number;
  killed_at: number;
}

interface CountRow {
  count: number;
}

interface TribeRow {
  name: string;
  name_short: string;
  member_count: number;
}

interface FetchedAtRow {
  fetched_at: number;
}

export class WorldAggregator {
  private db: Database.Database;
  private stalenessMs: number;

  constructor(db: Database.Database, stalenessMs = 600_000) {
    this.db = db;
    this.stalenessMs = stalenessMs;
  }

  aggregate(): WorldStatus {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // ── EVE EYES data ──
    const eeActivity = this.db
      .prepare('SELECT defense_index, infra_index, traffic_index, active_players, updated_at FROM region_activity ORDER BY updated_at DESC LIMIT 1')
      .get() as ActivityRow | undefined;

    const eeMeta: SourceMeta | null = eeActivity
      ? { provider: 'eve-eyes', fetchedAt: eeActivity.updated_at, stale: now - eeActivity.updated_at > this.stalenessMs }
      : null;

    // ── Utopia: killmails ──
    const recentKills = this.db
      .prepare('SELECT id, killer_name, killer_id, victim_name, victim_id, loss_type, solar_system_id, killed_at FROM utopia_killmails WHERE killed_at > ? ORDER BY killed_at DESC LIMIT 5')
      .all(now - day) as KillRow[];

    const kills24h = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_killmails WHERE killed_at > ?')
      .get(now - day) as CountRow).count;

    const activeSystems = (this.db
      .prepare('SELECT COUNT(DISTINCT solar_system_id) as count FROM utopia_killmails WHERE killed_at > ?')
      .get(now - day) as CountRow).count;

    // ── Utopia: characters ──
    const registered = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_characters')
      .get() as CountRow).count;

    const newLast24h = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_characters WHERE created_at > ?')
      .get(now - day) as CountRow).count;

    // ── Utopia: assemblies ──
    const onlineAssemblies = (this.db
      .prepare("SELECT COUNT(*) as count FROM utopia_assemblies WHERE state = 'ONLINE'")
      .get() as CountRow).count;

    const totalAssemblies = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_assemblies')
      .get() as CountRow).count;

    // ── Utopia: tribes ──
    const tribesCount = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_tribes')
      .get() as CountRow).count;

    const largestTribe = this.db
      .prepare('SELECT name, name_short, member_count FROM utopia_tribes ORDER BY member_count DESC LIMIT 1')
      .get() as TribeRow | undefined;

    // ── Utopia freshness ──
    const utopiaFetched = this.db
      .prepare('SELECT MAX(fetched_at) as fetched_at FROM utopia_killmails')
      .get() as FetchedAtRow | undefined;

    const utopiaMeta: SourceMeta | null = utopiaFetched?.fetched_at
      ? { provider: 'utopia', fetchedAt: utopiaFetched.fetched_at, stale: now - utopiaFetched.fetched_at > this.stalenessMs }
      : null;

    // ── Build WorldStatus ──
    const killEntries: KillEntry[] = recentKills.map((k) => ({
      id: k.id,
      killerName: k.killer_name,
      killerId: k.killer_id,
      victimName: k.victim_name,
      victimId: k.victim_id,
      lossType: k.loss_type,
      solarSystemId: k.solar_system_id,
      killedAt: k.killed_at,
    }));

    const status: WorldStatus = {
      players: {
        registered,
        active: eeActivity?.active_players ?? 0,
        newLast24h,
        sources: [utopiaMeta, eeMeta].filter((s): s is SourceMeta => s !== null),
      },
      combat: {
        kills24h,
        activeSystems,
        recentKills: killEntries,
        sources: utopiaMeta ? [utopiaMeta] : [],
      },
      infrastructure: {
        onlineAssemblies,
        totalAssemblies,
        infraIndex: eeActivity?.infra_index ?? 0,
        sources: [utopiaMeta, eeMeta].filter((s): s is SourceMeta => s !== null),
      },
      defense: {
        defenseIndex: eeActivity?.defense_index ?? 0,
        sources: eeMeta ? [eeMeta] : [],
      },
      traffic: {
        trafficIndex: eeActivity?.traffic_index ?? 0,
        sources: eeMeta ? [eeMeta] : [],
      },
      factions: {
        count: tribesCount,
        largest: largestTribe
          ? { name: largestTribe.name, ticker: largestTribe.name_short, members: largestTribe.member_count }
          : { name: '', ticker: '', members: 0 },
        sources: utopiaMeta ? [utopiaMeta] : [],
      },
      updatedAt: now,
    };

    // Cache result
    this.db
      .prepare('INSERT OR REPLACE INTO world_status_cache (id, status_json, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(status), now);

    return status;
  }

  getCached(): WorldStatus | null {
    const row = this.db
      .prepare('SELECT status_json FROM world_status_cache WHERE id = 1')
      .get() as { status_json: string } | undefined;
    return row ? JSON.parse(row.status_json) : null;
  }
}
