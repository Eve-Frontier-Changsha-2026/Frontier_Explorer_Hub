import type Database from 'better-sqlite3';
import type { SuiClient, SuiEvent } from '@mysten/sui/client';
import { config } from '../config.js';
import { getCursorForPackage, saveCursorForPackage } from './cursor.js';
import {
  handleIntelSubmitted,
  handleSubscriptionCreated,
  handleIntelUnlocked,
} from './handlers.js';
import {
  handleBountyCreated,
  handleProofSubmitted,
  handleProofRejected,
  handleProofResubmitted,
  handleDisputeRaised,
  handleDisputeResolved,
  handleProofAutoApproved,
} from './bounty-handlers.js';
import type {
  IntelSubmittedEvent,
  SubscriptionCreatedEvent,
  IntelUnlockedEvent,
  IntelBountyCreatedEvent,
  ProofSubmittedEvent,
  ProofRejectedEvent,
  ProofResubmittedEvent,
  DisputeRaisedEvent,
  DisputeResolvedEvent,
  ProofAutoApprovedEvent,
} from '../types/index.js';

interface EventSource {
  packageKey: string;
  eventTypes: string[];
}

export class EventIndexer {
  private db: Database.Database;
  private client: SuiClient;
  private pollIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private sources: EventSource[];

  constructor(db: Database.Database, client: SuiClient, pollIntervalMs = 5000) {
    this.db = db;
    this.client = client;
    this.pollIntervalMs = pollIntervalMs;

    this.sources = [
      {
        packageKey: 'explorer-hub',
        eventTypes: [
          `${config.packageId}::intel::IntelSubmittedEvent`,
          `${config.packageId}::subscription::SubscriptionCreatedEvent`,
          `${config.packageId}::access::IntelUnlockedEvent`,
          `${config.packageId}::bounty::IntelBountyCreatedEvent`,
        ],
      },
      {
        packageKey: 'bounty-escrow',
        eventTypes: [
          `${config.bountyEscrowPackageId}::bounty::ProofSubmittedEvent`,
          `${config.bountyEscrowPackageId}::bounty::ProofRejectedEvent`,
          `${config.bountyEscrowPackageId}::bounty::ProofResubmittedEvent`,
          `${config.bountyEscrowPackageId}::bounty::DisputeRaisedEvent`,
          `${config.bountyEscrowPackageId}::bounty::DisputeResolvedEvent`,
          `${config.bountyEscrowPackageId}::bounty::ProofAutoApprovedEvent`,
        ],
      },
    ];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[EventIndexer] Starting dual-package poll loop');
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    console.log('[EventIndexer] Stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    try {
      for (const source of this.sources) {
        for (const eventType of source.eventTypes) {
          await this.pollEventType(source.packageKey, eventType);
        }
      }
    } catch (err) {
      console.error('[EventIndexer] Poll error:', err);
    }
    if (this.running) {
      this.timer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  private async pollEventType(packageKey: string, eventType: string): Promise<void> {
    const cursor = getCursorForPackage(this.db, `${packageKey}:${eventType}`);
    const cursorParam = cursor.cursorTx && cursor.cursorEvent !== null
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
        saveCursorForPackage(
          this.db, `${packageKey}:${eventType}`,
          last.id.txDigest, parseInt(last.id.eventSeq, 10),
        );
      }
    }
  }

  processEvents(events: SuiEvent[]): void {
    for (const event of events) {
      try { this.routeEvent(event); }
      catch (err) {
        console.error(`[EventIndexer] Failed to handle event ${event.id.txDigest}:${event.id.eventSeq}:`, err);
      }
    }
  }

  private routeEvent(event: SuiEvent): void {
    const type = event.type;
    const data = event.parsedJson as Record<string, unknown>;
    const txDigest = event.id.txDigest;

    // Explorer Hub events
    if (type.endsWith('::IntelSubmittedEvent')) {
      handleIntelSubmitted(this.db, data as unknown as IntelSubmittedEvent);
    } else if (type.endsWith('::SubscriptionCreatedEvent')) {
      handleSubscriptionCreated(this.db, data as unknown as SubscriptionCreatedEvent);
    } else if (type.endsWith('::IntelUnlockedEvent')) {
      handleIntelUnlocked(this.db, data as unknown as IntelUnlockedEvent);
    } else if (type.endsWith('::IntelBountyCreatedEvent')) {
      this.handleBountyCreatedAsync(data as unknown as IntelBountyCreatedEvent, txDigest);
    }
    // bounty_escrow events
    else if (type.endsWith('::ProofSubmittedEvent')) {
      handleProofSubmitted(this.db, data as unknown as ProofSubmittedEvent, txDigest);
    } else if (type.endsWith('::ProofRejectedEvent')) {
      handleProofRejected(this.db, data as unknown as ProofRejectedEvent, txDigest);
    } else if (type.endsWith('::ProofResubmittedEvent')) {
      handleProofResubmitted(this.db, data as unknown as ProofResubmittedEvent, txDigest);
    } else if (type.endsWith('::DisputeRaisedEvent')) {
      handleDisputeRaised(this.db, data as unknown as DisputeRaisedEvent, txDigest);
    } else if (type.endsWith('::DisputeResolvedEvent')) {
      handleDisputeResolved(this.db, data as unknown as DisputeResolvedEvent, txDigest);
    } else if (type.endsWith('::ProofAutoApprovedEvent')) {
      handleProofAutoApproved(this.db, data as unknown as ProofAutoApprovedEvent, txDigest);
    }
  }

  private async handleBountyCreatedAsync(
    event: IntelBountyCreatedEvent, txDigest: string,
  ): Promise<void> {
    try {
      const obj = await this.client.getObject({
        id: event.bounty_id,
        options: { showContent: true },
      });
      const fields = (obj.data?.content as { fields: Record<string, unknown> })?.fields ?? {};
      handleBountyCreated(this.db, event, {
        rewardAmount: Number(fields['reward_amount'] ?? 0),
        deadline: Number(fields['deadline'] ?? 0),
      }, txDigest);
    } catch (err) {
      console.error(`[EventIndexer] Failed to supplement bounty ${event.bounty_id}:`, err);
      handleBountyCreated(this.db, event, { rewardAmount: 0, deadline: 0 }, txDigest);
    }
  }
}
