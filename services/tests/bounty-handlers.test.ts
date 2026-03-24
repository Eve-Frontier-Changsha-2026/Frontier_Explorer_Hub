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
