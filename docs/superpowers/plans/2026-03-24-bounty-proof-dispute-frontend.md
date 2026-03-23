# Bounty Proof/Dispute Frontend Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full bounty proof/dispute lifecycle support — indexer event processing, API endpoints, and frontend UI with role-based actions.

**Architecture:** Indexer-First approach. Polling EventIndexer processes 7 event types from 2 packages (Explorer Hub + bounty_escrow) into SQLite `bounties` + `bounty_events` tables. Express API serves 4 endpoints. Next.js frontend consumes API data, renders proof timeline, and enables role-based transaction actions via PTB builders.

**Tech Stack:** Express + better-sqlite3 (services), Next.js 15 + React 19 + TanStack Query + @mysten/dapp-kit + Tailwind CSS v4 (frontend), vitest (both)

**Spec:** `docs/superpowers/specs/2026-03-24-bounty-proof-dispute-frontend.md`

---

## File Structure

### Services (Create)
- `services/src/indexer/bounty-handlers.ts` — 7 bounty event handlers
- `services/tests/bounty-handlers.test.ts` — Handler unit tests
- `services/tests/bounty-routes.test.ts` — API route tests

### Services (Modify)
- `services/src/db/schema.ts` — Add `bounties` + `bounty_events` tables
- `services/src/types/index.ts` — Add bounty event types
- `services/src/config.ts` — Add `bountyEscrowPackageId`
- `services/src/indexer/cursor.ts` — Per-package cursor support
- `services/src/indexer/event-listener.ts` — Dual-package polling + bounty routing
- `services/src/api/routes/bounties.ts` — Replace stub with 4 real endpoints

### Frontend (Create)
- `next-monorepo/app/src/hooks/use-bounty-detail.ts` — Detail hook with mutations
- `next-monorepo/app/src/components/bounty/ProofTimeline.tsx` — Vertical event timeline
- `next-monorepo/app/src/components/bounty/ActionPanel.tsx` — Role-based action forms
- `next-monorepo/app/src/components/bounty/CountdownTimer.tsx` — Auto-approve countdown
- `next-monorepo/app/src/components/bounty/ClaimTicketList.tsx` — Hunters display
- `next-monorepo/app/src/app/bounties/[id]/page.tsx` — Detail page
- `next-monorepo/app/src/__tests__/ptb/bounty-proof.test.ts` — PTB builder tests
- `next-monorepo/app/src/__tests__/hooks/use-bounty-detail.test.ts` — Hook tests
- `next-monorepo/app/src/__tests__/api-client-bounty.test.ts` — API client tests

### Frontend (Modify)
- `next-monorepo/app/src/types/index.ts` — Add BountyDetail, BountyEvent, ClaimTicket types
- `next-monorepo/app/src/lib/constants.ts` — Add BOUNTY_ESCROW_PACKAGE_ID, SUI_TYPE, REVIEW_PERIOD_MS
- `next-monorepo/app/src/lib/api-client.ts` — Add 3 bounty API functions
- `next-monorepo/app/src/lib/ptb/bounty.ts` — Add 6 proof/dispute builders, deprecate old
- `next-monorepo/app/src/hooks/use-bounties.ts` — Add tabs, myBounties, mySubmissions
- `next-monorepo/app/src/app/bounties/page.tsx` — Add tabs, status column, links to detail

---

## Task 1: DB Schema + Config + Types

**Files:**
- Modify: `services/src/db/schema.ts`
- Modify: `services/src/config.ts`
- Modify: `services/src/types/index.ts`
- Modify: `services/src/indexer/cursor.ts`

- [ ] **Step 1: Add bounty tables to schema.ts**

After the `unlock_receipts` section, add:

```typescript
    -- ── Bounty proof/dispute ─────────────────────────────────────

    CREATE TABLE IF NOT EXISTS bounties (
      bounty_id          TEXT PRIMARY KEY,
      meta_id            TEXT NOT NULL,
      creator            TEXT NOT NULL,
      region_id          INTEGER NOT NULL,
      sector_x           INTEGER NOT NULL,
      sector_y           INTEGER NOT NULL,
      sector_z           INTEGER NOT NULL,
      intel_types_wanted TEXT NOT NULL,
      reward_amount      INTEGER NOT NULL,
      deadline           INTEGER NOT NULL,
      status             INTEGER NOT NULL DEFAULT 0,
      submission_count   INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bounty_creator
      ON bounties(creator);
    CREATE INDEX IF NOT EXISTS idx_bounty_status_deadline
      ON bounties(status, deadline);

    CREATE TABLE IF NOT EXISTS bounty_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bounty_id   TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      hunter      TEXT NOT NULL,
      actor       TEXT,
      detail      TEXT,
      timestamp   INTEGER NOT NULL,
      tx_digest   TEXT NOT NULL,
      FOREIGN KEY (bounty_id) REFERENCES bounties(bounty_id)
    );
    CREATE INDEX IF NOT EXISTS idx_bounty_events_timeline
      ON bounty_events(bounty_id, timestamp ASC);
```

- [ ] **Step 2: Extend event_cursor for per-package cursors**

Replace the single-row `event_cursor` table with a keyed version. In `schema.ts`, add a new table (keep old for backward compat):

```sql
    CREATE TABLE IF NOT EXISTS event_cursors (
      package_key  TEXT PRIMARY KEY,
      cursor_tx    TEXT,
      cursor_event INTEGER,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
```

In `cursor.ts`, add per-package functions alongside existing ones:

```typescript
export function getCursorForPackage(db: Database.Database, packageKey: string): CursorState {
  const row = db
    .prepare('SELECT cursor_tx, cursor_event FROM event_cursors WHERE package_key = ?')
    .get(packageKey) as { cursor_tx: string | null; cursor_event: number | null } | undefined;
  return {
    cursorTx: row?.cursor_tx ?? null,
    cursorEvent: row?.cursor_event ?? null,
  };
}

export function saveCursorForPackage(
  db: Database.Database,
  packageKey: string,
  cursorTx: string,
  cursorEvent: number,
): void {
  db.prepare(
    `INSERT INTO event_cursors (package_key, cursor_tx, cursor_event, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(package_key) DO UPDATE SET cursor_tx = ?, cursor_event = ?, updated_at = ?`,
  ).run(packageKey, cursorTx, cursorEvent, Date.now(), cursorTx, cursorEvent, Date.now());
}
```

**Migration note:** Moving from single `event_cursor` to per-key `event_cursors` means new event types start with no cursor and will re-process from the beginning. This is safe because:
- `handleBountyCreated` uses `INSERT OR IGNORE` — duplicates are no-ops
- Existing handlers (`handleIntelSubmitted`, etc.) also use `INSERT OR IGNORE`
- The old `event_cursor` table and functions are kept for backward compatibility but no longer used by EventIndexer after Task 3

- [ ] **Step 3: Add config**

In `config.ts`, add after `packageId`:

```typescript
  bountyEscrowPackageId: requireEnv('BOUNTY_ESCROW_PACKAGE_ID', '0x0'),
```

- [ ] **Step 4: Add bounty event types to services types/index.ts**

After `IntelUnlockedEvent`, add:

```typescript
// ── Bounty event types (from Move events) ────────────────────

export interface IntelBountyCreatedEvent {
  bounty_id: string;
  meta_id: string;
  creator: string;
  target_region: {
    region_id: number;
    sector_x: number;
    sector_y: number;
    sector_z: number;
  };
  intel_types_wanted: number[];
}

export interface ProofSubmittedEvent {
  bounty_id: string;
  hunter: string;
  proof_url: string;
  submitted_at: string; // u64 as string from JSON
}

export interface ProofRejectedEvent {
  bounty_id: string;
  hunter: string;
  verifier: string;
  reason: string;
  rejected_at: string;
}

export interface ProofResubmittedEvent {
  bounty_id: string;
  hunter: string;
  proof_url: string;
  resubmitted_at: string;
}

export interface DisputeRaisedEvent {
  bounty_id: string;
  hunter: string;
  reason: string;
  disputed_at: string;
}

export interface DisputeResolvedEvent {
  bounty_id: string;
  hunter: string;
  resolved_by: string;
  approved: boolean;
  resolved_at: string;
}

export interface ProofAutoApprovedEvent {
  bounty_id: string;
  hunter: string;
  approved_at: string;
}

// Bounty status codes
export const BOUNTY_STATUS = {
  OPEN: 0,
  CLAIMED: 1,
  PROOF_SUBMITTED: 2,
  PROOF_REJECTED: 3,
  DISPUTED: 4,
  COMPLETED: 5,
} as const;
```

- [ ] **Step 5: Run existing tests to confirm nothing broke**

Run: `cd services && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add services/src/db/schema.ts services/src/config.ts services/src/types/index.ts services/src/indexer/cursor.ts
git commit -m "feat(services): add bounty schema, config, types, per-package cursor"
```

---

## Task 2: Bounty Event Handlers + Tests

**Files:**
- Create: `services/src/indexer/bounty-handlers.ts`
- Create: `services/tests/bounty-handlers.test.ts`

- [ ] **Step 1: Write handler tests first**

Create `services/tests/bounty-handlers.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { getTestDb } from '../src/db/client.js';
import {
  handleBountyCreated,
  handleProofSubmitted,
  handleProofRejected,
  handleProofResubmitted,
  handleDisputeRaised,
  handleDisputeResolved,
  handleProofAutoApproved,
} from '../src/indexer/bounty-handlers.js';
import { BOUNTY_STATUS } from '../src/types/index.js';

let db: Database.Database;

beforeEach(() => { db = getTestDb(); });
afterEach(() => { db.close(); });

const BOUNTY_ID = '0xbounty1';
const META_ID = '0xmeta1';
const HUNTER = '0xhunter';
const CREATOR = '0xcreator';
const VERIFIER = '0xverifier';
const TX = '0xtx123';

function seedBounty() {
  handleBountyCreated(db, {
    bounty_id: BOUNTY_ID,
    meta_id: META_ID,
    creator: CREATOR,
    target_region: { region_id: 1, sector_x: 10, sector_y: 20, sector_z: 5 },
    intel_types_wanted: [0, 1],
  }, { rewardAmount: 1_000_000_000, deadline: Date.now() + 86400000 }, TX);
}

function getRow(table: string, key: string, value: string) {
  return db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(value) as Record<string, unknown> | undefined;
}

function getEvents(bountyId: string) {
  return db.prepare('SELECT * FROM bounty_events WHERE bounty_id = ? ORDER BY timestamp ASC').all(bountyId) as Record<string, unknown>[];
}

describe('handleBountyCreated', () => {
  it('inserts bounty with correct fields', () => {
    seedBounty();
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row).toBeTruthy();
    expect(row!['creator']).toBe(CREATOR);
    expect(row!['meta_id']).toBe(META_ID);
    expect(row!['region_id']).toBe(1);
    expect(row!['intel_types_wanted']).toBe('[0,1]');
    expect(row!['status']).toBe(BOUNTY_STATUS.OPEN);
    expect(row!['reward_amount']).toBe(1_000_000_000);
  });

  it('ignores duplicate bounty_id', () => {
    seedBounty();
    seedBounty();
    const count = db.prepare('SELECT COUNT(*) as c FROM bounties').get() as { c: number };
    expect(count.c).toBe(1);
  });
});

describe('handleProofSubmitted', () => {
  it('inserts event and updates bounty status', () => {
    seedBounty();
    handleProofSubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: 'https://proof.example', submitted_at: '1700000100',
    }, TX);
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.PROOF_SUBMITTED);
    expect(row!['submission_count']).toBe(1);
    const events = getEvents(BOUNTY_ID);
    expect(events.length).toBe(1);
    expect(events[0]!['event_type']).toBe('proof_submitted');
    expect(JSON.parse(events[0]!['detail'] as string).proofUrl).toBe('https://proof.example');
  });

  it('skips if bounty not found (orphan event)', () => {
    handleProofSubmitted(db, {
      bounty_id: '0xorphan', hunter: HUNTER,
      proof_url: 'https://proof.example', submitted_at: '1700000100',
    }, TX);
    const events = getEvents('0xorphan');
    expect(events.length).toBe(0);
  });
});

describe('handleProofRejected', () => {
  it('inserts event with reason and updates status', () => {
    seedBounty();
    handleProofSubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: 'https://proof.example', submitted_at: '1700000100',
    }, TX);
    handleProofRejected(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER, verifier: VERIFIER,
      reason: 'blurry image', rejected_at: '1700000200',
    }, 'tx2');
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.PROOF_REJECTED);
    const events = getEvents(BOUNTY_ID);
    expect(events.length).toBe(2);
    expect(JSON.parse(events[1]!['detail'] as string).reason).toBe('blurry image');
    expect(events[1]!['actor']).toBe(VERIFIER);
  });
});

describe('handleProofResubmitted', () => {
  it('updates status back to PROOF_SUBMITTED and increments count', () => {
    seedBounty();
    handleProofSubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: 'https://v1', submitted_at: '1700000100',
    }, TX);
    handleProofRejected(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER, verifier: VERIFIER,
      reason: 'bad', rejected_at: '1700000200',
    }, 'tx2');
    handleProofResubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: 'https://v2', resubmitted_at: '1700000300',
    }, 'tx3');
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.PROOF_SUBMITTED);
    expect(row!['submission_count']).toBe(2);
  });
});

describe('handleDisputeRaised', () => {
  it('updates status to DISPUTED', () => {
    seedBounty();
    handleProofSubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: 'https://v1', submitted_at: '1700000100',
    }, TX);
    handleProofRejected(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER, verifier: VERIFIER,
      reason: 'bad', rejected_at: '1700000200',
    }, 'tx2');
    handleDisputeRaised(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      reason: 'rejection was unjust', disputed_at: '1700000300',
    }, 'tx3');
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.DISPUTED);
  });
});

describe('handleDisputeResolved', () => {
  it('approved=true sets COMPLETED', () => {
    seedBounty();
    handleDisputeResolved(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      resolved_by: CREATOR, approved: true, resolved_at: '1700000400',
    }, 'tx4');
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.COMPLETED);
  });

  it('approved=false sets PROOF_REJECTED', () => {
    seedBounty();
    handleDisputeResolved(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      resolved_by: CREATOR, approved: false, resolved_at: '1700000400',
    }, 'tx4');
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.PROOF_REJECTED);
  });
});

describe('handleProofAutoApproved', () => {
  it('sets COMPLETED', () => {
    seedBounty();
    handleProofAutoApproved(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      approved_at: '1700000500',
    }, 'tx5');
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['status']).toBe(BOUNTY_STATUS.COMPLETED);
  });
});
```

- [ ] **Step 2: Run tests — they should fail (handlers not yet implemented)**

Run: `cd services && npx vitest run tests/bounty-handlers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement bounty-handlers.ts**

Create `services/src/indexer/bounty-handlers.ts`:

```typescript
import type Database from 'better-sqlite3';
import type {
  IntelBountyCreatedEvent,
  ProofSubmittedEvent,
  ProofRejectedEvent,
  ProofResubmittedEvent,
  DisputeRaisedEvent,
  DisputeResolvedEvent,
  ProofAutoApprovedEvent,
} from '../types/index.js';
import { BOUNTY_STATUS } from '../types/index.js';

const stmtCache = new WeakMap<Database.Database, ReturnType<typeof prepareStmts>>();

function prepareStmts(db: Database.Database) {
  return {
    insertBounty: db.prepare(`
      INSERT OR IGNORE INTO bounties
        (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
         intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `),
    insertEvent: db.prepare(`
      INSERT INTO bounty_events (bounty_id, event_type, hunter, actor, detail, timestamp, tx_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateStatus: db.prepare(`
      UPDATE bounties SET status = ?, updated_at = ? WHERE bounty_id = ?
    `),
    incrementSubmissions: db.prepare(`
      UPDATE bounties SET status = ?, submission_count = submission_count + 1, updated_at = ? WHERE bounty_id = ?
    `),
    bountyExists: db.prepare(`SELECT 1 FROM bounties WHERE bounty_id = ?`),
  };
}

function getStmts(db: Database.Database) {
  let s = stmtCache.get(db);
  if (!s) { s = prepareStmts(db); stmtCache.set(db, s); }
  return s;
}

function exists(db: Database.Database, bountyId: string): boolean {
  return !!getStmts(db).bountyExists.get(bountyId);
}

export function handleBountyCreated(
  db: Database.Database,
  event: IntelBountyCreatedEvent,
  supplement: { rewardAmount: number; deadline: number },
  txDigest: string,
): void {
  const { insertBounty } = getStmts(db);
  const now = Date.now();
  insertBounty.run(
    event.bounty_id, event.meta_id, event.creator,
    event.target_region.region_id, event.target_region.sector_x,
    event.target_region.sector_y, event.target_region.sector_z,
    JSON.stringify(event.intel_types_wanted),
    supplement.rewardAmount, supplement.deadline,
    BOUNTY_STATUS.OPEN, now, now,
  );
}

export function handleProofSubmitted(
  db: Database.Database, event: ProofSubmittedEvent, txDigest: string,
): void {
  if (!exists(db, event.bounty_id)) return;
  const { insertEvent, incrementSubmissions } = getStmts(db);
  const ts = Number(event.submitted_at);
  insertEvent.run(
    event.bounty_id, 'proof_submitted', event.hunter, null,
    JSON.stringify({ proofUrl: event.proof_url }), ts, txDigest,
  );
  incrementSubmissions.run(BOUNTY_STATUS.PROOF_SUBMITTED, ts, event.bounty_id);
}

export function handleProofRejected(
  db: Database.Database, event: ProofRejectedEvent, txDigest: string,
): void {
  if (!exists(db, event.bounty_id)) return;
  const { insertEvent, updateStatus } = getStmts(db);
  const ts = Number(event.rejected_at);
  insertEvent.run(
    event.bounty_id, 'proof_rejected', event.hunter, event.verifier,
    JSON.stringify({ reason: event.reason }), ts, txDigest,
  );
  updateStatus.run(BOUNTY_STATUS.PROOF_REJECTED, ts, event.bounty_id);
}

export function handleProofResubmitted(
  db: Database.Database, event: ProofResubmittedEvent, txDigest: string,
): void {
  if (!exists(db, event.bounty_id)) return;
  const { insertEvent, incrementSubmissions } = getStmts(db);
  const ts = Number(event.resubmitted_at);
  insertEvent.run(
    event.bounty_id, 'proof_resubmitted', event.hunter, null,
    JSON.stringify({ proofUrl: event.proof_url }), ts, txDigest,
  );
  incrementSubmissions.run(BOUNTY_STATUS.PROOF_SUBMITTED, ts, event.bounty_id);
}

export function handleDisputeRaised(
  db: Database.Database, event: DisputeRaisedEvent, txDigest: string,
): void {
  if (!exists(db, event.bounty_id)) return;
  const { insertEvent, updateStatus } = getStmts(db);
  const ts = Number(event.disputed_at);
  insertEvent.run(
    event.bounty_id, 'dispute_raised', event.hunter, null,
    JSON.stringify({ reason: event.reason }), ts, txDigest,
  );
  updateStatus.run(BOUNTY_STATUS.DISPUTED, ts, event.bounty_id);
}

export function handleDisputeResolved(
  db: Database.Database, event: DisputeResolvedEvent, txDigest: string,
): void {
  if (!exists(db, event.bounty_id)) return;
  const { insertEvent, updateStatus } = getStmts(db);
  const ts = Number(event.resolved_at);
  const newStatus = event.approved ? BOUNTY_STATUS.COMPLETED : BOUNTY_STATUS.PROOF_REJECTED;
  insertEvent.run(
    event.bounty_id, 'dispute_resolved', event.hunter, event.resolved_by,
    JSON.stringify({ approved: event.approved }), ts, txDigest,
  );
  updateStatus.run(newStatus, ts, event.bounty_id);
}

export function handleProofAutoApproved(
  db: Database.Database, event: ProofAutoApprovedEvent, txDigest: string,
): void {
  if (!exists(db, event.bounty_id)) return;
  const { insertEvent, updateStatus } = getStmts(db);
  const ts = Number(event.approved_at);
  insertEvent.run(
    event.bounty_id, 'proof_auto_approved', event.hunter, null,
    null, ts, txDigest,
  );
  updateStatus.run(BOUNTY_STATUS.COMPLETED, ts, event.bounty_id);
}
```

- [ ] **Step 4: Run handler tests**

Run: `cd services && npx vitest run tests/bounty-handlers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run all services tests**

Run: `cd services && npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 6: Commit**

```bash
git add services/src/indexer/bounty-handlers.ts services/tests/bounty-handlers.test.ts
git commit -m "feat(indexer): add 7 bounty event handlers with tests"
```

---

## Task 3: EventIndexer Dual-Package Polling

**Files:**
- Modify: `services/src/indexer/event-listener.ts`

- [ ] **Step 1: Extend EventIndexer to poll both packages**

Rewrite `event-listener.ts` to support multiple package sources with per-package cursors:

```typescript
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
      // Needs getObject supplement — schedule async; for now insert with event data
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
      // Fallback: insert with 0 values
      handleBountyCreated(this.db, event, { rewardAmount: 0, deadline: 0 }, txDigest);
    }
  }
}
```

- [ ] **Step 2: Run all services tests**

Run: `cd services && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add services/src/indexer/event-listener.ts
git commit -m "feat(indexer): dual-package polling for Explorer Hub + bounty_escrow events"
```

---

## Task 4: Bounty API Endpoints + Tests

**Files:**
- Modify: `services/src/api/routes/bounties.ts`
- Create: `services/tests/bounty-routes.test.ts`

- [ ] **Step 1: Write route tests**

Create `services/tests/bounty-routes.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import { config } from '../src/config.js';
import { BOUNTY_STATUS } from '../src/types/index.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let app: ReturnType<typeof createApp>;

function makeToken(address: string): string {
  return jwt.sign({ address }, config.jwtSecret);
}

beforeAll(() => {
  db = getTestDb();
  app = createApp({ db });

  const now = Date.now();
  // Seed bounties
  db.prepare(`
    INSERT INTO bounties (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
      intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-1', 'meta-1', '0xcreator', 1, 10, 20, 5, '[0,1]', 1_000_000_000, now + 86400000,
    BOUNTY_STATUS.PROOF_SUBMITTED, 1, now, now);

  db.prepare(`
    INSERT INTO bounties (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
      intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-2', 'meta-2', '0xother', 2, 0, 0, 0, '[2]', 500_000_000, now + 172800000,
    BOUNTY_STATUS.OPEN, 0, now - 1000, now - 1000);

  // Expired bounty (status < 5 but deadline passed)
  db.prepare(`
    INSERT INTO bounties (bounty_id, meta_id, creator, region_id, sector_x, sector_y, sector_z,
      intel_types_wanted, reward_amount, deadline, status, submission_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-expired', 'meta-3', '0xcreator', 1, 0, 0, 0, '[0]', 100, now - 1000,
    BOUNTY_STATUS.OPEN, 0, now - 86400000, now - 86400000);

  // Seed bounty_events
  db.prepare(`
    INSERT INTO bounty_events (bounty_id, event_type, hunter, actor, detail, timestamp, tx_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('bounty-1', 'proof_submitted', '0xhunter', null,
    '{"proofUrl":"https://proof.example"}', now, 'tx-submit');
});

afterAll(() => { db.close(); });

describe('GET /api/bounties/active', () => {
  it('returns non-expired active bounties', async () => {
    const token = makeToken('0xanyone');
    const res = await request(app).get('/api/bounties/active').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(2); // bounty-1 + bounty-2, not expired
    expect(res.body.bounties.map((b: { bountyId: string }) => b.bountyId).sort())
      .toEqual(['bounty-1', 'bounty-2']);
  });
});

describe('GET /api/bounties/:bountyId', () => {
  it('returns bounty with events', async () => {
    const token = makeToken('0xanyone');
    const res = await request(app).get('/api/bounties/bounty-1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounty.bountyId).toBe('bounty-1');
    expect(res.body.bounty.events.length).toBe(1);
    expect(res.body.bounty.events[0].eventType).toBe('proof_submitted');
  });

  it('returns 404 for unknown bounty', async () => {
    const token = makeToken('0xanyone');
    const res = await request(app).get('/api/bounties/nonexistent').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/bounties/by-creator/:address', () => {
  it('returns bounties by creator', async () => {
    const token = makeToken('0xcreator');
    const res = await request(app).get('/api/bounties/by-creator/0xcreator').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(2); // bounty-1 + bounty-expired
  });
});

describe('GET /api/bounties/by-hunter/:address', () => {
  it('returns bounties where hunter has events', async () => {
    const token = makeToken('0xhunter');
    const res = await request(app).get('/api/bounties/by-hunter/0xhunter').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(1);
    expect(res.body.bounties[0].bountyId).toBe('bounty-1');
  });

  it('returns empty for unknown hunter', async () => {
    const token = makeToken('0xnobody');
    const res = await request(app).get('/api/bounties/by-hunter/0xnobody').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bounties.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — should fail (routes not implemented)**

Run: `cd services && npx vitest run tests/bounty-routes.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement bounty routes**

Rewrite `services/src/api/routes/bounties.ts`:

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';

interface BountyRow {
  bounty_id: string;
  meta_id: string;
  creator: string;
  region_id: number;
  sector_x: number;
  sector_y: number;
  sector_z: number;
  intel_types_wanted: string;
  reward_amount: number;
  deadline: number;
  status: number;
  submission_count: number;
  created_at: number;
  updated_at: number;
}

interface EventRow {
  id: number;
  bounty_id: string;
  event_type: string;
  hunter: string;
  actor: string | null;
  detail: string | null;
  timestamp: number;
  tx_digest: string;
}

function formatBounty(row: BountyRow) {
  return {
    bountyId: row.bounty_id,
    metaId: row.meta_id,
    creator: row.creator,
    targetRegion: {
      regionId: row.region_id,
      sectorX: row.sector_x,
      sectorY: row.sector_y,
      sectorZ: row.sector_z,
    },
    intelTypesWanted: JSON.parse(row.intel_types_wanted),
    rewardAmount: row.reward_amount,
    deadline: row.deadline,
    status: row.status,
    submissionCount: row.submission_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatEvent(row: EventRow) {
  return {
    id: row.id,
    bountyId: row.bounty_id,
    eventType: row.event_type,
    hunter: row.hunter,
    actor: row.actor,
    detail: row.detail ? JSON.parse(row.detail) : null,
    timestamp: row.timestamp,
    txDigest: row.tx_digest,
  };
}

export function createBountiesRouter(db: Database.Database, suiClient?: SuiClient): Router {
  const router = Router();

  const stmts = {
    active: db.prepare(
      'SELECT * FROM bounties WHERE status < 5 AND deadline > ? ORDER BY created_at DESC',
    ),
    detail: db.prepare('SELECT * FROM bounties WHERE bounty_id = ?'),
    events: db.prepare(
      'SELECT * FROM bounty_events WHERE bounty_id = ? ORDER BY timestamp ASC',
    ),
    byCreator: db.prepare(
      'SELECT * FROM bounties WHERE creator = ? ORDER BY created_at DESC',
    ),
    byHunter: db.prepare(
      `SELECT DISTINCT b.* FROM bounties b
       JOIN bounty_events e ON b.bounty_id = e.bounty_id
       WHERE e.hunter = ? ORDER BY b.updated_at DESC`,
    ),
  };

  router.get('/bounties/active', (_req, res) => {
    const rows = stmts.active.all(Date.now()) as BountyRow[];
    res.json({ bounties: rows.map(formatBounty) });
  });

  router.get('/bounties/by-creator/:address', (req, res) => {
    const rows = stmts.byCreator.all(req.params.address) as BountyRow[];
    res.json({ bounties: rows.map(formatBounty) });
  });

  router.get('/bounties/by-hunter/:address', (req, res) => {
    const rows = stmts.byHunter.all(req.params.address) as BountyRow[];
    res.json({ bounties: rows.map(formatBounty) });
  });

  // NOTE: This must come AFTER /by-creator and /by-hunter to avoid :bountyId matching those paths
  router.get('/bounties/:bountyId', async (req, res) => {
    try {
      const row = stmts.detail.get(req.params.bountyId) as BountyRow | undefined;
      if (!row) { res.status(404).json({ error: 'Bounty not found' }); return; }
      const events = stmts.events.all(req.params.bountyId) as EventRow[];

      // Supplement with on-chain claim ticket data
      let hunters: { hunter: string; stakeAmount: number }[] = [];
      if (suiClient) {
        try {
          const obj = await suiClient.getObject({
            id: req.params.bountyId,
            options: { showContent: true },
          });
          const fields = (obj.data?.content as { fields: Record<string, unknown> })?.fields;
          if (fields?.['active_hunter_stakes']) {
            // VecMap<address, u64> serialized as { keys: address[], values: string[] }
            const stakes = fields['active_hunter_stakes'] as { fields?: { contents?: Array<{ fields: { key: string; value: string } }> } };
            const contents = stakes?.fields?.contents ?? [];
            hunters = contents.map((entry) => ({
              hunter: entry.fields.key,
              stakeAmount: Number(entry.fields.value),
            }));
          }
        } catch (err) {
          console.warn(`[bounties] Failed to fetch claim tickets for ${req.params.bountyId}:`, err);
        }
      }

      res.json({
        bounty: { ...formatBounty(row), events: events.map(formatEvent), hunters },
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Update server.ts to pass db to bounties router**

In `services/src/api/server.ts`, find the line that mounts the bounties router and update it to pass `db`. The function signature of `createBountiesRouter` now requires `db`.

Look for: `app.use('/api', createBountiesRouter());`
Change to: `app.use('/api', createBountiesRouter(db, suiClient));`

Where `suiClient` is the `SuiClient` instance already available in the server context (used by EventIndexer). If `createApp` doesn't receive it yet, add it to the options parameter.

- [ ] **Step 5: Run bounty route tests**

Run: `cd services && npx vitest run tests/bounty-routes.test.ts`
Expected: All PASS

- [ ] **Step 6: Run all services tests**

Run: `cd services && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add services/src/api/routes/bounties.ts services/src/api/server.ts services/tests/bounty-routes.test.ts
git commit -m "feat(api): bounty endpoints — active, detail, by-creator, by-hunter"
```

---

## Task 5: Frontend Types + Constants

**Files:**
- Modify: `next-monorepo/app/src/types/index.ts`
- Modify: `next-monorepo/app/src/lib/constants.ts`

- [ ] **Step 1: Add bounty detail types**

In `next-monorepo/app/src/types/index.ts`, after existing `BountyRequest`, add:

```typescript
export interface BountyDetail extends BountyRequest {
  metaId: string;
  updatedAt: number;
  events: BountyEvent[];
  hunters: ClaimTicket[];
}

export interface BountyEvent {
  id: number;
  bountyId: string;
  eventType: 'proof_submitted' | 'proof_rejected' | 'proof_resubmitted'
           | 'dispute_raised' | 'dispute_resolved' | 'proof_auto_approved';
  hunter: string;
  actor: string | null;
  detail: ProofDetail | RejectDetail | DisputeDetail | ResolveDetail | null;
  timestamp: number;
  txDigest: string;
}

export interface ClaimTicket {
  hunter: string;
  stakeAmount: number;
}

// NOTE: proofDescription is optional because ProofSubmittedEvent/ProofResubmittedEvent
// do NOT include proof_description — only proof_url. The description is stored on-chain
// in the Bounty's dynamic field but not emitted in events. Timeline will show URL only.
export interface ProofDetail { proofUrl: string; proofDescription?: string }
export interface RejectDetail { reason: string }
export interface DisputeDetail { reason: string }
export interface ResolveDetail { approved: boolean }

export type BountyRole = 'creator' | 'hunter' | 'viewer';
```

- [ ] **Step 2: Add constants**

In `next-monorepo/app/src/lib/constants.ts`, add:

```typescript
export const BOUNTY_ESCROW_PACKAGE_ID = process.env.NEXT_PUBLIC_BOUNTY_ESCROW_PACKAGE_ID ?? "0x0";
export const SUI_TYPE = "0x2::sui::SUI";
export const CLOCK_ID = "0x6";
export const REVIEW_PERIOD_MS = 259_200_000; // 72 hours

export const BOUNTY_STATUS = {
  OPEN: 0,
  CLAIMED: 1,
  PROOF_SUBMITTED: 2,
  PROOF_REJECTED: 3,
  DISPUTED: 4,
  COMPLETED: 5,
} as const;

export const BOUNTY_STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Claimed",
  2: "Proof Submitted",
  3: "Rejected",
  4: "Disputed",
  5: "Completed",
};
```

- [ ] **Step 3: Type check**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/constants.ts
git commit -m "feat(types): add BountyDetail, BountyEvent, bounty constants"
```

---

## Task 6: Frontend API Client + Tests

**Files:**
- Modify: `next-monorepo/app/src/lib/api-client.ts`
- Create: `next-monorepo/app/src/__tests__/api-client-bounty.test.ts`

- [ ] **Step 1: Write API client tests**

Create `next-monorepo/app/src/__tests__/api-client-bounty.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBountyDetail, getBountiesByCreator, getBountiesByHunter, setJwt } from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => { mockFetch.mockReset(); setJwt(null); });

describe("bounty API client", () => {
  it("getBountyDetail calls correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bounty: { bountyId: "0x1", events: [] } }),
    });
    const result = await getBountyDetail("0x1");
    expect(result.bounty.bountyId).toBe("0x1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bounties/0x1"),
      expect.anything(),
    );
  });

  it("getBountiesByCreator calls correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bounties: [] }),
    });
    await getBountiesByCreator("0xabc");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bounties/by-creator/0xabc"),
      expect.anything(),
    );
  });

  it("getBountiesByHunter calls correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bounties: [] }),
    });
    await getBountiesByHunter("0xdef");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bounties/by-hunter/0xdef"),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd next-monorepo && npx vitest run src/__tests__/api-client-bounty.test.ts`
Expected: FAIL

- [ ] **Step 3: Add API client functions**

In `next-monorepo/app/src/lib/api-client.ts`, add after `getActiveBounties`:

```typescript
export function getBountyDetail(bountyId: string) {
  return apiFetch<{ bounty: BountyDetail }>(`/api/bounties/${bountyId}`);
}

export function getBountiesByCreator(address: string) {
  return apiFetch<{ bounties: BountyRequest[] }>(`/api/bounties/by-creator/${address}`);
}

export function getBountiesByHunter(address: string) {
  return apiFetch<{ bounties: BountyRequest[] }>(`/api/bounties/by-hunter/${address}`);
}
```

Add `BountyDetail` to the import from `@/types`.

- [ ] **Step 4: Run tests**

Run: `cd next-monorepo && npx vitest run src/__tests__/api-client-bounty.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/lib/api-client.ts next-monorepo/app/src/__tests__/api-client-bounty.test.ts
git commit -m "feat(api-client): add getBountyDetail, getBountiesByCreator, getBountiesByHunter"
```

---

## Task 7: Frontend PTB Builders + Tests

**Files:**
- Modify: `next-monorepo/app/src/lib/ptb/bounty.ts`
- Create: `next-monorepo/app/src/__tests__/ptb/bounty-proof.test.ts`

- [ ] **Step 1: Write PTB builder tests**

Create `next-monorepo/app/src/__tests__/ptb/bounty-proof.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import {
  buildSubmitIntelProof,
  buildResubmitIntelProof,
  buildRejectProof,
  buildDisputeRejection,
  buildResolveDispute,
  buildAutoApproveProof,
} from "@/lib/ptb/bounty";

const OBJ = "0x" + "1".repeat(64);
const OBJ2 = "0x" + "2".repeat(64);
const OBJ3 = "0x" + "3".repeat(64);
const ADDR = "0x" + "a".repeat(64);

describe("buildSubmitIntelProof", () => {
  it("creates moveCall with correct arguments", () => {
    const tx = new Transaction();
    buildSubmitIntelProof(tx, {
      bountyId: OBJ, metaId: OBJ2, intelId: OBJ3,
      proofUrl: "https://proof.example", proofDescription: "test desc",
      clockId: "0x6",
    });
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildResubmitIntelProof", () => {
  it("creates moveCall", () => {
    const tx = new Transaction();
    buildResubmitIntelProof(tx, {
      bountyId: OBJ, metaId: OBJ2, intelId: OBJ3,
      proofUrl: "https://v2.example", proofDescription: "updated",
      clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildRejectProof", () => {
  it("creates moveCall with typeArguments", () => {
    const tx = new Transaction();
    buildRejectProof(tx, {
      bountyId: OBJ, hunter: ADDR, reason: "bad proof",
      verifierCapId: OBJ2, clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildDisputeRejection", () => {
  it("creates moveCall", () => {
    const tx = new Transaction();
    buildDisputeRejection(tx, {
      bountyId: OBJ, reason: "rejection was unjust", clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildResolveDispute", () => {
  it("creates moveCall with approve flag", () => {
    const tx = new Transaction();
    buildResolveDispute(tx, {
      bountyId: OBJ, hunter: ADDR, approve: true, clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildAutoApproveProof", () => {
  it("creates moveCall", () => {
    const tx = new Transaction();
    buildAutoApproveProof(tx, { bountyId: OBJ, clockId: "0x6" });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests — should fail**

Run: `cd next-monorepo && npx vitest run src/__tests__/ptb/bounty-proof.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PTB builders**

Rewrite `next-monorepo/app/src/lib/ptb/bounty.ts`:

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, BOUNTY_ESCROW_PACKAGE_ID, SUI_TYPE } from "../constants";
import type { GridCell } from "@/types";

// ── Existing builders (unchanged) ────────────────────────────

export function buildCreateBounty(
  tx: Transaction,
  targetRegion: GridCell,
  intelTypesWanted: number[],
  rewardMist: number,
  deadlineMs: number,
  clockId: string,
): Transaction {
  const [rewardCoin] = tx.splitCoins(tx.gas, [rewardMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::create_bounty`,
    arguments: [
      rewardCoin,
      tx.pure.u64(targetRegion.regionId),
      tx.pure.u64(targetRegion.sectorX),
      tx.pure.u64(targetRegion.sectorY),
      tx.pure.u64(targetRegion.sectorZ),
      tx.pure.u8(targetRegion.zoomLevel),
      tx.pure.vector("u8", intelTypesWanted),
      tx.pure.u64(deadlineMs),
      tx.object(clockId),
    ],
  });
  return tx;
}

/** @deprecated Use buildSubmitIntelProof instead */
export function buildSubmitForBounty(
  tx: Transaction, bountyId: string, intelId: string, clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::submit_for_bounty`,
    arguments: [tx.object(bountyId), tx.object(intelId), tx.object(clockId)],
  });
  return tx;
}

export function buildRefundExpiredBounty(
  tx: Transaction, bountyId: string, clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::refund_expired_bounty`,
    arguments: [tx.object(bountyId), tx.object(clockId)],
  });
  return tx;
}

// ── Proof/Dispute builders (new) ─────────────────────────────

export function buildSubmitIntelProof(
  tx: Transaction,
  params: {
    bountyId: string; metaId: string; intelId: string;
    proofUrl: string; proofDescription: string; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::submit_intel_proof`,
    arguments: [
      tx.object(params.bountyId),
      tx.object(params.metaId),
      tx.object(params.intelId),
      tx.pure.string(params.proofUrl),
      tx.pure.string(params.proofDescription),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildResubmitIntelProof(
  tx: Transaction,
  params: {
    bountyId: string; metaId: string; intelId: string;
    proofUrl: string; proofDescription: string; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::resubmit_intel_proof`,
    arguments: [
      tx.object(params.bountyId),
      tx.object(params.metaId),
      tx.object(params.intelId),
      tx.pure.string(params.proofUrl),
      tx.pure.string(params.proofDescription),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildRejectProof(
  tx: Transaction,
  params: {
    bountyId: string; hunter: string; reason: string;
    verifierCapId: string; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::reject_proof`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.pure.address(params.hunter),
      tx.pure.string(params.reason),
      tx.object(params.verifierCapId),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildDisputeRejection(
  tx: Transaction,
  params: { bountyId: string; reason: string; clockId: string },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::dispute_rejection`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.pure.string(params.reason),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildResolveDispute(
  tx: Transaction,
  params: {
    bountyId: string; hunter: string; approve: boolean; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::resolve_dispute`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.pure.address(params.hunter),
      tx.pure.bool(params.approve),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildAutoApproveProof(
  tx: Transaction,
  params: { bountyId: string; clockId: string },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::auto_approve_proof`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.object(params.clockId),
    ],
  });
  return tx;
}
```

- [ ] **Step 4: Update existing bounty.test.ts import**

The old `bounty.test.ts` imports `buildSubmitForBounty` which still exists (deprecated). Verify it still works.

- [ ] **Step 5: Run all PTB tests**

Run: `cd next-monorepo && npx vitest run src/__tests__/ptb/`
Expected: All PASS (old + new)

- [ ] **Step 6: Type check**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add next-monorepo/app/src/lib/ptb/bounty.ts next-monorepo/app/src/__tests__/ptb/bounty-proof.test.ts
git commit -m "feat(ptb): add 6 proof/dispute PTB builders with tests"
```

---

## Task 8: useBountyDetail Hook + Tests

**Files:**
- Create: `next-monorepo/app/src/hooks/use-bounty-detail.ts`
- Create: `next-monorepo/app/src/__tests__/hooks/use-bounty-detail.test.ts`

- [ ] **Step 1: Write hook tests**

Create `next-monorepo/app/src/__tests__/hooks/use-bounty-detail.test.ts`. Follow the pattern from `use-market.test.ts` or `use-intel.test.ts` — mock api-client, test query behavior and derived state.

Key tests:
- Returns bounty data when loaded
- `role` is `'creator'` when wallet matches creator
- `role` is `'hunter'` when wallet matches event hunter
- `role` is `'viewer'` otherwise
- `currentProofStatus` derived from latest proof event
- `reviewDeadline` calculated from latest submit event + REVIEW_PERIOD_MS
- Mutation functions exist and are callable

- [ ] **Step 2: Run tests — should fail**

Run: `cd next-monorepo && npx vitest run src/__tests__/hooks/use-bounty-detail.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useBountyDetail hook**

Create `next-monorepo/app/src/hooks/use-bounty-detail.ts`:

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getBountyDetail } from "@/lib/api-client";
import {
  buildSubmitIntelProof,
  buildResubmitIntelProof,
  buildRejectProof,
  buildDisputeRejection,
  buildResolveDispute,
  buildAutoApproveProof,
} from "@/lib/ptb/bounty";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "./use-auth";
import { useSuiClient } from "@mysten/dapp-kit";
import { CLOCK_ID, REVIEW_PERIOD_MS, BOUNTY_STATUS, BOUNTY_ESCROW_PACKAGE_ID } from "@/lib/constants";
import type { BountyDetail, BountyRole } from "@/types";

export function useBountyDetail(bountyId: string) {
  const { isAuthenticated } = useAuth();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ["bounty", bountyId],
    queryFn: () => getBountyDetail(bountyId),
    enabled: isAuthenticated && !!bountyId,
    staleTime: 15_000,
  });

  const bounty = query.data?.bounty ?? null;
  const walletAddress = account?.address ?? "";

  // Derived: role
  const role: BountyRole = (() => {
    if (!bounty || !walletAddress) return "viewer";
    if (bounty.creator === walletAddress) return "creator";
    if (bounty.events.some((e) => e.hunter === walletAddress)) return "hunter";
    return "viewer";
  })();

  // Derived: current proof status (latest proof-related event for connected wallet)
  const currentProofStatus = (() => {
    if (!bounty) return null;
    const hunterEvents = bounty.events.filter((e) => e.hunter === walletAddress);
    if (hunterEvents.length === 0) return null;
    return hunterEvents[hunterEvents.length - 1]!.eventType;
  })();

  // Derived: VerifierCap for creator role (needed for reject_proof)
  // Uses @mysten/dapp-kit's useSuiClientQuery to fetch owned VerifierCap objects
  const verifierCapQuery = useQuery({
    queryKey: ["verifier-cap", walletAddress, bountyId],
    queryFn: async () => {
      if (!account) return null;
      const { data } = await suiClient.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: `${BOUNTY_ESCROW_PACKAGE_ID}::verifier::VerifierCap` },
        options: { showContent: true },
      });
      // Find cap matching this bounty
      const cap = data.find((obj) => {
        const fields = (obj.data?.content as { fields: Record<string, unknown> })?.fields;
        return fields?.['bounty_id'] === bountyId;
      });
      return cap?.data?.objectId ?? null;
    },
    enabled: role === "creator" && !!walletAddress,
    staleTime: 60_000,
  });
  const verifierCapId = verifierCapQuery.data ?? null;

  // Derived: review deadline
  const reviewDeadline = (() => {
    if (!bounty) return null;
    const submitEvents = bounty.events.filter(
      (e) => e.eventType === "proof_submitted" || e.eventType === "proof_resubmitted",
    );
    if (submitEvents.length === 0) return null;
    const latest = submitEvents[submitEvents.length - 1]!;
    return latest.timestamp + REVIEW_PERIOD_MS;
  })();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bounty", bountyId] });
    queryClient.invalidateQueries({ queryKey: ["bounties"] });
  };

  function makeMutation<P>(
    buildFn: (tx: Transaction, params: P) => Transaction,
    successMsg: string,
  ) {
    return useMutation({
      mutationFn: async (params: P) => {
        const tx = new Transaction();
        buildFn(tx, params);
        const result = await signAndExecute({ transaction: tx as never });
        setPendingTx(result.digest);
        return result;
      },
      onSuccess: (result) => {
        invalidate();
        addToast({ type: "success", message: `${successMsg} — ${result.digest.slice(0, 16)}...` });
        setPendingTx(null);
      },
      onError: (err) => {
        addToast({ type: "error", message: `Failed: ${String((err as Error).message ?? err)}` });
        setPendingTx(null);
      },
    });
  }

  const submitProof = makeMutation(
    (tx, p: { metaId: string; intelId: string; proofUrl: string; proofDescription: string }) =>
      buildSubmitIntelProof(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Proof submitted",
  );
  const resubmitProof = makeMutation(
    (tx, p: { metaId: string; intelId: string; proofUrl: string; proofDescription: string }) =>
      buildResubmitIntelProof(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Proof resubmitted",
  );
  const rejectProof = makeMutation(
    (tx, p: { hunter: string; reason: string; verifierCapId: string }) =>
      buildRejectProof(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Proof rejected",
  );
  const disputeRejection = makeMutation(
    (tx, p: { reason: string }) =>
      buildDisputeRejection(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Dispute filed",
  );
  const resolveDispute = makeMutation(
    (tx, p: { hunter: string; approve: boolean }) =>
      buildResolveDispute(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Dispute resolved",
  );
  const autoApproveProof = makeMutation(
    (tx, _p: Record<string, never>) =>
      buildAutoApproveProof(tx, { bountyId, clockId: CLOCK_ID }),
    "Proof auto-approved",
  );

  return {
    bounty,
    isLoading: query.isLoading,
    role,
    currentProofStatus,
    reviewDeadline,
    verifierCapId,
    submitProof: submitProof.mutateAsync,
    resubmitProof: resubmitProof.mutateAsync,
    rejectProof: rejectProof.mutateAsync,
    disputeRejection: disputeRejection.mutateAsync,
    resolveDispute: resolveDispute.mutateAsync,
    autoApproveProof: autoApproveProof.mutateAsync,
    isSubmitting: submitProof.isPending || resubmitProof.isPending || rejectProof.isPending
      || disputeRejection.isPending || resolveDispute.isPending || autoApproveProof.isPending,
  };
}
```

- [ ] **Step 4: Run hook tests**

Run: `cd next-monorepo && npx vitest run src/__tests__/hooks/use-bounty-detail.test.ts`
Expected: All PASS

- [ ] **Step 5: Type check**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/hooks/use-bounty-detail.ts next-monorepo/app/src/__tests__/hooks/use-bounty-detail.test.ts
git commit -m "feat(hooks): add useBountyDetail with role detection, mutations, review deadline"
```

---

## Task 9: Bounty Detail Components

**Files:**
- Create: `next-monorepo/app/src/components/bounty/CountdownTimer.tsx`
- Create: `next-monorepo/app/src/components/bounty/ClaimTicketList.tsx`
- Create: `next-monorepo/app/src/components/bounty/ProofTimeline.tsx`
- Create: `next-monorepo/app/src/components/bounty/ActionPanel.tsx`

- [ ] **Step 1: Create CountdownTimer**

Reference: bounty_escrow `CountdownTimer.tsx`. Simple component:
- Props: `targetMs: number`, `label?: string`
- Uses `setInterval(1000)` for live update
- Urgency colors: `> 1h` cyan, `< 1h` yellow, `< 10min` red
- Display: `3d 4h` / `2h 30m` / `45m 20s` / `Expired`
- EVE theme classes: `text-eve-cyan`, `text-amber-400`, `text-red-400`

- [ ] **Step 2: Create ClaimTicketList**

Props: `hunters: ClaimTicket[]`, `currentAddress?: string`
- Lists hunter addresses (truncated) + stake amounts
- Highlights `(you)` in gold if matches `currentAddress`

- [ ] **Step 3: Create ProofTimeline**

Props: `events: BountyEvent[]`, `reviewDeadline: number | null`
- Vertical timeline with left border (`border-l-2 border-eve-panel-border`)
- Each event card: timestamp, actor, type badge, detail content
- `proof_submitted` / `proof_resubmitted`: show proof URL as clickable link
- `proof_rejected`: show reason in red border card
- `dispute_raised`: show reason in amber border card
- `dispute_resolved`: show approved/rejected verdict
- `proof_auto_approved`: show success badge
- `tx_digest`: link to `https://suiscan.xyz/testnet/tx/${txDigest}`
- If latest event is `proof_submitted` and `reviewDeadline` set: show `CountdownTimer`

- [ ] **Step 4: Create ActionPanel**

Props: `role: BountyRole`, `bountyId: string`, `metaId: string`, `currentProofStatus: string | null`, `reviewDeadline: number | null`, mutations from hook
- Inline expand pattern: each button toggles a form area below
- Creator actions: Reject Proof (textarea for reason), Resolve Dispute (two buttons)
- Hunter actions: Submit Proof (url + description), Resubmit (same), Dispute (textarea), Auto Approve (button only)
- Conditional rendering based on `currentProofStatus`
- Character counters on inputs

- [ ] **Step 5: Type check**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/components/bounty/
git commit -m "feat(components): add ProofTimeline, ActionPanel, CountdownTimer, ClaimTicketList"
```

---

## Task 10: Bounty Detail Page

**Files:**
- Create: `next-monorepo/app/src/app/bounties/[id]/page.tsx`

- [ ] **Step 1: Create detail page**

Layout (top to bottom):
1. PageHeader with back link + bounty ID + StatusChip + RiskBadge
2. Info Panel: region, types, reward, deadline, creator, submissions
3. ClaimTicketList (if hunters exist)
4. ProofTimeline (if events exist)
5. ActionPanel (role-based)

Wire up `useBountyDetail(id)` hook. Get `id` from `useParams()`.

Loading state: skeleton panels.
Error state: "Bounty not found" message.

- [ ] **Step 2: Type check**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/bounties/[id]/page.tsx
git commit -m "feat(page): add bounty detail page /bounties/[id]"
```

---

## Task 11: Bounty List Page Update + useBounties Extension

**Files:**
- Modify: `next-monorepo/app/src/hooks/use-bounties.ts`
- Modify: `next-monorepo/app/src/app/bounties/page.tsx`

- [ ] **Step 1: Extend useBounties hook**

Add to `use-bounties.ts`:
- `myBounties` query using `getBountiesByCreator(walletAddress)` — enabled when wallet connected
- `mySubmissions` query using `getBountiesByHunter(walletAddress)` — enabled when wallet connected
- `activeTab` / `setActiveTab` state: `'all' | 'my-bounties' | 'my-submissions'`
- Return all new state alongside existing returns

- [ ] **Step 2: Update bounty list page**

In `bounties/page.tsx`:
- Add tab bar: All Active / My Bounties / My Submissions
- My Bounties and My Submissions tabs only visible when wallet connected
- Bounty ID column: wrap in `<Link href={/bounties/${id}}>` (Next.js Link)
- Add status column using `StatusChip` with `BOUNTY_STATUS_LABELS`
- Switch displayed data based on `activeTab`

- [ ] **Step 3: Type check**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run all frontend tests**

Run: `cd next-monorepo && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/hooks/use-bounties.ts next-monorepo/app/src/app/bounties/page.tsx
git commit -m "feat(bounties): add tabs, status column, detail links to list page"
```

---

## Task 12: Final Verification + Monkey Tests

**Files:**
- Services and frontend test files

- [ ] **Step 1: Run all services tests**

Run: `cd services && npx vitest run`
Expected: All pass

- [ ] **Step 2: Run all frontend tests**

Run: `cd next-monorepo && npx vitest run`
Expected: All pass

- [ ] **Step 3: Type check both**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Add monkey tests for handlers**

In `services/tests/bounty-handlers.test.ts`, add monkey test section:

```typescript
describe('monkey tests', () => {
  it('handles rapid duplicate events gracefully', () => {
    seedBounty();
    for (let i = 0; i < 10; i++) {
      handleProofSubmitted(db, {
        bounty_id: BOUNTY_ID, hunter: HUNTER,
        proof_url: `https://proof-${i}`, submitted_at: String(1700000100 + i),
      }, `tx-${i}`);
    }
    const row = getRow('bounties', 'bounty_id', BOUNTY_ID);
    expect(row!['submission_count']).toBe(10);
    const events = getEvents(BOUNTY_ID);
    expect(events.length).toBe(10);
  });

  it('handles events for non-existent bounty without crashing', () => {
    expect(() => {
      handleProofSubmitted(db, {
        bounty_id: '0xghost', hunter: HUNTER,
        proof_url: 'https://x', submitted_at: '1',
      }, 'tx');
      handleProofRejected(db, {
        bounty_id: '0xghost', hunter: HUNTER, verifier: VERIFIER,
        reason: 'no', rejected_at: '1',
      }, 'tx');
      handleDisputeRaised(db, {
        bounty_id: '0xghost', hunter: HUNTER,
        reason: 'why', disputed_at: '1',
      }, 'tx');
    }).not.toThrow();
  });

  it('handles empty string fields', () => {
    seedBounty();
    handleProofSubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: '', submitted_at: '1700000100',
    }, TX);
    const events = getEvents(BOUNTY_ID);
    expect(JSON.parse(events[0]!['detail'] as string).proofUrl).toBe('');
  });

  it('handles max u64 timestamp', () => {
    seedBounty();
    handleProofSubmitted(db, {
      bounty_id: BOUNTY_ID, hunter: HUNTER,
      proof_url: 'https://x', submitted_at: '18446744073709551615',
    }, TX);
    const events = getEvents(BOUNTY_ID);
    expect(events.length).toBe(1);
  });
});
```

- [ ] **Step 5: Run all tests one final time**

Run: `cd services && npx vitest run && cd ../next-monorepo && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add services/tests/bounty-handlers.test.ts
git commit -m "test(monkey): add bounty handler edge case tests"
```

- [ ] **Step 7: Update progress.md**

Update `tasks/progress.md` with completed task details.
