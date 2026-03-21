import type Database from 'better-sqlite3';
import type { EveEyesClient } from './client.js';
import type { EveActivityIndex } from '../types/index.js';

const WINDOW_HOURS = 24;

export class ActivityTracker {
  private db: Database.Database;
  private client: EveEyesClient;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;

  constructor(db: Database.Database, client: EveEyesClient, pollIntervalMs = 300_000) {
    this.db = db;
    this.client = client;
    this.pollIntervalMs = pollIntervalMs;
  }

  async pollActivity(): Promise<void> {
    const now = Date.now();
    const windowStart = now - WINDOW_HOURS * 60 * 60 * 1000;

    // Query totals for key modules (page 1 only — we just need pagination.total)
    const [turretTotal, nodeTotal, gateTotal] = await Promise.all([
      this.client.getModuleCallCount('turret'),
      this.client.getModuleCallCount('network_node'),
      this.client.getModuleCallCount('gate'),
    ]);

    // Compute indices (calls per hour, normalized by window)
    const defenseIndex = turretTotal / WINDOW_HOURS;
    const infraIndex = nodeTotal / WINDOW_HOURS;
    const trafficIndex = gateTotal / WINDOW_HOURS;

    // Estimate active players: get recent pages and count distinct senders
    const senders = new Set<string>();
    const modules = ['turret', 'network_node', 'gate'] as const;
    for (const mod of modules) {
      const res = await this.client.getMoveCalls({ moduleName: mod }, 1, 50);
      for (const call of res.items) {
        senders.add(call.senderAddress);
      }
    }

    this.db
      .prepare(
        `INSERT INTO region_activity
          (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, defenseIndex, infraIndex, trafficIndex, senders.size, windowStart, now, now);
  }

  start(): void {
    // Fire immediately, then repeat
    void this.pollActivity().catch((err) =>
      console.error('[ActivityTracker] poll error:', err),
    );
    this.intervalHandle = setInterval(() => {
      void this.pollActivity().catch((err) =>
        console.error('[ActivityTracker] poll error:', err),
      );
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  static getLatestActivity(db: Database.Database): EveActivityIndex | null {
    const row = db
      .prepare('SELECT * FROM region_activity ORDER BY updated_at DESC LIMIT 1')
      .get() as
      | {
          defense_index: number;
          infra_index: number;
          traffic_index: number;
          active_players: number;
          window_start: number;
          window_end: number;
          updated_at: number;
        }
      | undefined;

    if (!row) return null;

    return {
      defenseIndex: row.defense_index,
      infraIndex: row.infra_index,
      trafficIndex: row.traffic_index,
      activePlayers: row.active_players,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      updatedAt: row.updated_at,
    };
  }
}
