import type Database from 'better-sqlite3';
import type {
  IntelSubmittedEvent,
  SubscriptionCreatedEvent,
  IntelUnlockedEvent,
} from '../types/index.js';

// Prepared statements cache (keyed by db instance)
const stmtCache = new WeakMap<Database.Database, ReturnType<typeof prepareStatements>>();

function prepareStatements(db: Database.Database) {
  return {
    insertIntel: db.prepare(`
      INSERT OR IGNORE INTO intel_reports
        (intel_id, reporter, region_id, sector_x, sector_y, sector_z,
         zoom_level, intel_type, severity, timestamp, expiry, visibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertSubscription: db.prepare(`
      INSERT OR IGNORE INTO subscriptions
        (subscription_id, subscriber, tier, started_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    insertUnlock: db.prepare(`
      INSERT OR IGNORE INTO unlock_receipts
        (receipt_id, buyer, intel_id, unlocked_at, price_paid)
      VALUES (?, ?, ?, ?, ?)
    `),
  };
}

function getStmts(db: Database.Database) {
  let stmts = stmtCache.get(db);
  if (!stmts) {
    stmts = prepareStatements(db);
    stmtCache.set(db, stmts);
  }
  return stmts;
}

export function handleIntelSubmitted(
  db: Database.Database,
  event: IntelSubmittedEvent,
): void {
  const { insertIntel } = getStmts(db);
  insertIntel.run(
    event.intelId,
    event.reporter,
    event.location.regionId,
    event.location.sectorX,
    event.location.sectorY,
    event.location.sectorZ,
    event.location.zoomLevel,
    event.intelType,
    event.severity,
    event.timestamp,
    0, // expiry not in event, default 0
    event.visibility,
  );
}

export function handleSubscriptionCreated(
  db: Database.Database,
  event: SubscriptionCreatedEvent,
): void {
  const { insertSubscription } = getStmts(db);
  insertSubscription.run(
    event.subscriptionId,
    event.subscriber,
    event.tier,
    Date.now(), // started_at not in event, use now
    event.expiresAt,
  );
}

export function handleIntelUnlocked(
  db: Database.Database,
  event: IntelUnlockedEvent,
): void {
  const { insertUnlock } = getStmts(db);
  insertUnlock.run(
    event.receiptId,
    event.buyer,
    event.intelId,
    Date.now(), // unlocked_at not in event, use now
    event.pricePaid,
  );
}
