import type Database from 'better-sqlite3';
import type { EveEyesClient } from './client.js';
import type { EveActivityIndex } from '../types/index.js';

const WINDOW_HOURS = 24;

export class ActivityTracker {
  private db: Database.Database;
  private client: EveEyesClient;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;
  onPollComplete: (() => void) | null = null;

  constructor(db: Database.Database, client: EveEyesClient, pollIntervalMs = 300_000) {
    this.db = db;
    this.client = client;
    this.pollIntervalMs = pollIntervalMs;
  }

  async pollActivity(): Promise<void> {
    const now = Date.now();
    const windowStart = now - WINDOW_HOURS * 60 * 60 * 1000;

    // Use aggregated endpoint instead of 3 separate paginated calls
    let turretTotal = 0;
    let nodeTotal = 0;
    let gateTotal = 0;
    try {
      const { modules } = await this.client.getModuleCallCounts();
      for (const mod of modules) {
        const name = mod.moduleName.toLowerCase();
        const count = mod.count;
        if (name.includes('turret')) turretTotal = count;
        else if (name.includes('network_node') || name.includes('network node')) nodeTotal = count;
        else if (name.includes('gate')) gateTotal = count;
      }
    } catch {
      // Fallback to individual calls if new endpoint fails
      [turretTotal, nodeTotal, gateTotal] = await Promise.all([
        this.client.getModuleCallCount('turret'),
        this.client.getModuleCallCount('network_node'),
        this.client.getModuleCallCount('gate'),
      ]);
    }

    const defenseIndex = turretTotal / WINDOW_HOURS;
    const infraIndex = nodeTotal / WINDOW_HOURS;
    const trafficIndex = gateTotal / WINDOW_HOURS;

    // Estimate active players: get recent pages and count distinct senders
    const senders = new Set<string>();
    const moduleNames = ['turret', 'network_node', 'gate'] as const;
    for (const mod of moduleNames) {
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
    const runPoll = () => {
      void this.pollActivity()
        .then(() => { this.onPollComplete?.(); })
        .catch((err) => console.error('[ActivityTracker] poll error:', err));
    };
    runPoll();
    this.intervalHandle = setInterval(runPoll, this.pollIntervalMs);
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
