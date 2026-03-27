import type Database from 'better-sqlite3';
import { getUtopiaClient, type UtopiaClient } from './client.js';

export class UtopiaTracker {
  private db: Database.Database;
  private client: UtopiaClient;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;
  public onPollComplete?: () => void;

  constructor(db: Database.Database, pollIntervalMs = 300_000) {
    this.db = db;
    this.client = getUtopiaClient();
    this.pollIntervalMs = pollIntervalMs;
  }

  async pollAll(): Promise<void> {
    const now = Date.now();
    const errors: string[] = [];

    // Fetch all endpoints in parallel
    const [killmailsRes, charactersRes, assembliesRes, tribesRes] = await Promise.allSettled([
      this.client.getKillmails(),
      this.client.getCharacters(),
      this.client.getAssemblies('NWN', 'ONLINE'),
      this.client.getTribes(),
    ]);

    // ── Killmails ──
    if (killmailsRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_killmails
          (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const k of killmailsRes.value.items) {
          upsert.run(k.id, k.killerId, k.killerName, k.victimId, k.victimName, k.reporterId, k.reporterName, k.lossType, k.solarSystemId, k.killedAt, k.shard, now);
        }
      });
      tx();
    } else {
      errors.push(`killmails: ${killmailsRes.reason}`);
    }

    // ── Characters ──
    if (charactersRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_characters
          (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const c of charactersRes.value.items) {
          upsert.run(c.id, c.name, c.address, c.tribeId, c.tribeName, c.tribeTicker, c.createdAt, now);
        }
      });
      tx();
    } else {
      errors.push(`characters: ${charactersRes.reason}`);
    }

    // ── Assemblies ──
    if (assembliesRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_assemblies
          (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const a of assembliesRes.value.items) {
          upsert.run(a.id, a.state, a.ownerId, a.ownerName, a.name, a.typeId, a.anchoredAt, now);
        }
      });
      tx();
    } else {
      errors.push(`assemblies: ${assembliesRes.reason}`);
    }

    // ── Tribes ──
    if (tribesRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_tribes
          (id, name, name_short, description, member_count, created_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const t of tribesRes.value.items) {
          upsert.run(t.id, t.name, t.nameShort, t.description ?? '', t.memberCount, t.createdAt, now);
        }
      });
      tx();
    } else {
      errors.push(`tribes: ${tribesRes.reason}`);
    }

    if (errors.length > 0) {
      console.error('[UtopiaTracker] partial poll errors:', errors);
    }

    this.onPollComplete?.();
  }

  start(): void {
    void this.pollAll().catch((err) =>
      console.error('[UtopiaTracker] initial poll error:', err),
    );
    this.intervalHandle = setInterval(() => {
      void this.pollAll().catch((err) =>
        console.error('[UtopiaTracker] poll error:', err),
      );
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
