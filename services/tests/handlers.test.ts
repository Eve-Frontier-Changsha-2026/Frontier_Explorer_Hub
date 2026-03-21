import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { getTestDb } from '../src/db/client.js';
import {
  handleIntelSubmitted,
  handleSubscriptionCreated,
  handleIntelUnlocked,
} from '../src/indexer/handlers.js';
import { getCursor, saveCursor } from '../src/indexer/cursor.js';
import type {
  IntelSubmittedEvent,
  SubscriptionCreatedEvent,
  IntelUnlockedEvent,
} from '../src/types/index.js';

let db: Database.Database;

beforeEach(() => {
  db = getTestDb();
});

afterEach(() => {
  db.close();
});

// ── Intel Submitted ────────────────────────────────────────────

describe('handleIntelSubmitted', () => {
  const event: IntelSubmittedEvent = {
    intelId: 'intel-001',
    reporter: '0xabc',
    location: {
      regionId: 1,
      sectorX: 10,
      sectorY: 20,
      sectorZ: 30,
      zoomLevel: 2,
    },
    intelType: 0,
    severity: 5,
    timestamp: 1700000000,
    visibility: 0,
  };

  it('inserts a new intel report', () => {
    handleIntelSubmitted(db, event);

    const row = db
      .prepare('SELECT * FROM intel_reports WHERE intel_id = ?')
      .get('intel-001') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row['reporter']).toBe('0xabc');
    expect(row['region_id']).toBe(1);
    expect(row['sector_x']).toBe(10);
    expect(row['intel_type']).toBe(0);
    expect(row['severity']).toBe(5);
  });

  it('ignores duplicate intel_id', () => {
    handleIntelSubmitted(db, event);
    handleIntelSubmitted(db, event); // second insert

    const count = db
      .prepare('SELECT COUNT(*) as cnt FROM intel_reports WHERE intel_id = ?')
      .get('intel-001') as { cnt: number };

    expect(count.cnt).toBe(1);
  });
});

// ── Subscription Created ───────────────────────────────────────

describe('handleSubscriptionCreated', () => {
  const event: SubscriptionCreatedEvent = {
    subscriptionId: 'sub-001',
    subscriber: '0xdef',
    tier: 1,
    expiresAt: 1700100000,
  };

  it('inserts a new subscription', () => {
    handleSubscriptionCreated(db, event);

    const row = db
      .prepare('SELECT * FROM subscriptions WHERE subscription_id = ?')
      .get('sub-001') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row['subscriber']).toBe('0xdef');
    expect(row['tier']).toBe(1);
    expect(row['expires_at']).toBe(1700100000);
  });

  it('ignores duplicate subscription_id', () => {
    handleSubscriptionCreated(db, event);
    handleSubscriptionCreated(db, event);

    const count = db
      .prepare(
        'SELECT COUNT(*) as cnt FROM subscriptions WHERE subscription_id = ?',
      )
      .get('sub-001') as { cnt: number };

    expect(count.cnt).toBe(1);
  });
});

// ── Intel Unlocked ─────────────────────────────────────────────

describe('handleIntelUnlocked', () => {
  const event: IntelUnlockedEvent = {
    receiptId: 'rcpt-001',
    buyer: '0x123',
    intelId: 'intel-001',
    pricePaid: 500,
    reporterShare: 400,
  };

  it('inserts a new unlock receipt', () => {
    handleIntelUnlocked(db, event);

    const row = db
      .prepare('SELECT * FROM unlock_receipts WHERE receipt_id = ?')
      .get('rcpt-001') as Record<string, unknown>;

    expect(row).toBeTruthy();
    expect(row['buyer']).toBe('0x123');
    expect(row['intel_id']).toBe('intel-001');
    expect(row['price_paid']).toBe(500);
  });

  it('ignores duplicate receipt_id', () => {
    handleIntelUnlocked(db, event);
    handleIntelUnlocked(db, event);

    const count = db
      .prepare(
        'SELECT COUNT(*) as cnt FROM unlock_receipts WHERE receipt_id = ?',
      )
      .get('rcpt-001') as { cnt: number };

    expect(count.cnt).toBe(1);
  });
});

// ── Cursor ─────────────────────────────────────────────────────

describe('cursor', () => {
  it('returns null cursor initially', () => {
    const cursor = getCursor(db);
    expect(cursor.cursorTx).toBeNull();
    expect(cursor.cursorEvent).toBeNull();
  });

  it('saves and retrieves cursor', () => {
    saveCursor(db, 'tx-abc-123', 42);

    const cursor = getCursor(db);
    expect(cursor.cursorTx).toBe('tx-abc-123');
    expect(cursor.cursorEvent).toBe(42);
  });

  it('overwrites previous cursor', () => {
    saveCursor(db, 'tx-1', 1);
    saveCursor(db, 'tx-2', 99);

    const cursor = getCursor(db);
    expect(cursor.cursorTx).toBe('tx-2');
    expect(cursor.cursorEvent).toBe(99);
  });
});
