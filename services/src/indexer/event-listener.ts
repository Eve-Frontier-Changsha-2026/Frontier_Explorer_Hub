import type Database from 'better-sqlite3';
import type { SuiClient, SuiEvent } from '@mysten/sui/client';
import { config } from '../config.js';
import { getCursor, saveCursor } from './cursor.js';
import {
  handleIntelSubmitted,
  handleSubscriptionCreated,
  handleIntelUnlocked,
} from './handlers.js';
import type {
  IntelSubmittedEvent,
  SubscriptionCreatedEvent,
  IntelUnlockedEvent,
} from '../types/index.js';

const EVENT_TYPES = [
  `${config.packageId}::intel::IntelSubmittedEvent`,
  `${config.packageId}::subscription::SubscriptionCreatedEvent`,
  `${config.packageId}::access::IntelUnlockedEvent`,
] as const;

export class EventIndexer {
  private db: Database.Database;
  private client: SuiClient;
  private pollIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    db: Database.Database,
    client: SuiClient,
    pollIntervalMs = 5000,
  ) {
    this.db = db;
    this.client = client;
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[EventIndexer] Starting poll loop');
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[EventIndexer] Stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      for (const eventType of EVENT_TYPES) {
        await this.pollEventType(eventType);
      }
    } catch (err) {
      console.error('[EventIndexer] Poll error:', err);
    }

    if (this.running) {
      this.timer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  private async pollEventType(eventType: string): Promise<void> {
    const cursor = getCursor(this.db);
    const cursorParam =
      cursor.cursorTx && cursor.cursorEvent !== null
        ? { txDigest: cursor.cursorTx, eventSeq: String(cursor.cursorEvent) }
        : undefined;

    const result = await this.client.queryEvents({
      query: { MoveEventType: eventType },
      cursor: cursorParam,
      limit: 50,
      order: 'ascending',
    });

    if (result.data.length > 0) {
      this.processEvents(result.data);

      const last = result.data[result.data.length - 1]!;
      if (last.id.txDigest && last.id.eventSeq) {
        saveCursor(this.db, last.id.txDigest, parseInt(last.id.eventSeq, 10));
      }
    }
  }

  processEvents(events: SuiEvent[]): void {
    for (const event of events) {
      try {
        this.routeEvent(event);
      } catch (err) {
        console.error(
          `[EventIndexer] Failed to handle event ${event.id.txDigest}:${event.id.eventSeq}:`,
          err,
        );
      }
    }
  }

  private routeEvent(event: SuiEvent): void {
    const type = event.type;
    const data = event.parsedJson as Record<string, unknown>;

    if (type.endsWith('::IntelSubmittedEvent')) {
      handleIntelSubmitted(this.db, data as unknown as IntelSubmittedEvent);
    } else if (type.endsWith('::SubscriptionCreatedEvent')) {
      handleSubscriptionCreated(
        this.db,
        data as unknown as SubscriptionCreatedEvent,
      );
    } else if (type.endsWith('::IntelUnlockedEvent')) {
      handleIntelUnlocked(this.db, data as unknown as IntelUnlockedEvent);
    }
  }
}
