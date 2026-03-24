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
  _txDigest: string,
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
