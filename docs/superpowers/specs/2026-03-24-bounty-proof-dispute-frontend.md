# Bounty Proof/Dispute Frontend Integration — Design Spec

**Date:** 2026-03-24
**Scope:** Indexer event handling + API endpoints + Frontend UI for bounty proof/dispute lifecycle
**Approach:** Indexer-First (Option A) — all data from indexer DB, no RPC fallback

## 1. Overview

Extend the Frontier Explorer Hub to support the full bounty proof/dispute lifecycle:
- **Indexer**: Process 7 event types (1 create + 6 proof/dispute) into SQLite
- **API**: 4 endpoints for bounty list, detail, creator view, hunter view
- **Frontend**: Bounty detail page (`/bounties/[id]`) with proof timeline, role-based actions, countdown timer

### Preconditions
- Move `bounty.move` wrapper complete (submit_intel_proof, resubmit_intel_proof + 57 tests)
- bounty_escrow v3 deployed with 6 proof/dispute events
- Existing indexer architecture: Express + SQLite + polling EventIndexer

### Out of Scope
- Tier-gating on bounty data (bounties are public)
- Custom review period tracking (hardcode 72h)
- Walrus proof storage (proof_url is user-provided)

---

## 2. DB Schema

### `bounties` table

| Column | Type | Description |
|--------|------|-------------|
| bounty_id | TEXT PK | Bounty object ID |
| meta_id | TEXT | IntelBountyMeta object ID |
| creator | TEXT | Creator address |
| region_id | INTEGER | Target region ID |
| sector_x | INTEGER | Sector X coordinate |
| sector_y | INTEGER | Sector Y coordinate |
| sector_z | INTEGER | Sector Z coordinate |
| intel_types_wanted | TEXT | JSON array e.g. `[0,2,3]` |
| reward_amount | INTEGER | Reward in MIST |
| deadline | INTEGER | Unix timestamp ms |
| status | INTEGER | Current status (derived from latest event) |
| submission_count | INTEGER | Total proof submissions |
| created_at | INTEGER | Creation event timestamp |
| updated_at | INTEGER | Latest event timestamp |

### `bounty_events` table (append-only)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK AUTOINCREMENT | Row ID |
| bounty_id | TEXT FK | Reference to bounties.bounty_id |
| event_type | TEXT | One of 6 proof/dispute event types |
| hunter | TEXT NOT NULL | Hunter address (all proof/dispute events have hunter) |
| actor | TEXT | Who triggered (verifier/resolver/hunter, NULL if same as hunter) |
| detail | TEXT | JSON: `{proof_url}`, `{reason}`, `{approved}` per type |
| timestamp | INTEGER | Event timestamp ms |
| tx_digest | TEXT | Transaction hash for explorer link |

### Indexes
- `bounty_events(bounty_id, timestamp ASC)` — timeline query
- `bounties(creator)` — creator filter
- `bounties(status, deadline)` — active bounties filter

### Status codes
| Value | Name | Triggered by |
|-------|------|-------------|
| 0 | OPEN | bounty created (no proof yet) |
| 1 | CLAIMED | hunter claimed (future: track via ClaimTicket event) |
| 2 | PROOF_SUBMITTED | proof_submitted / proof_resubmitted |
| 3 | PROOF_REJECTED | proof_rejected / dispute_resolved(approved=false) |
| 4 | DISPUTED | dispute_raised |
| 5 | COMPLETED | dispute_resolved(approved=true) / proof_auto_approved |

---

## 3. Indexer Event Handlers

### Event types to monitor

| Event | Package | Handler |
|-------|---------|---------|
| `bounty::IntelBountyCreatedEvent` | Explorer Hub (`PACKAGE_ID`) | `handleBountyCreated` |
| `bounty_escrow::ProofSubmittedEvent` | Bounty Escrow (`BOUNTY_ESCROW_PACKAGE_ID`) | `handleProofSubmitted` |
| `bounty_escrow::ProofRejectedEvent` | Bounty Escrow | `handleProofRejected` |
| `bounty_escrow::ProofResubmittedEvent` | Bounty Escrow | `handleProofResubmitted` |
| `bounty_escrow::DisputeRaisedEvent` | Bounty Escrow | `handleDisputeRaised` |
| `bounty_escrow::DisputeResolvedEvent` | Bounty Escrow | `handleDisputeResolved` |
| `bounty_escrow::ProofAutoApprovedEvent` | Bounty Escrow | `handleProofAutoApproved` |

### Dual package polling
EventIndexer currently polls one package. Extend to poll both:
- `PACKAGE_ID` — Explorer Hub events (intel, subscription, unlock, bounty create)
- `BOUNTY_ESCROW_PACKAGE_ID` — bounty_escrow events (6 proof/dispute events)

Config addition: `BOUNTY_ESCROW_PACKAGE_ID` env var.

### Handler logic (all 6 proof/dispute handlers)
1. INSERT into `bounty_events` with tx_digest
2. UPDATE `bounties` SET `status`, `updated_at` (proof_submitted also increments `submission_count`)
3. If `bounty_id` not found in `bounties` → log warning, skip (orphan event from non-Explorer Hub bounty)

### handleBountyCreated
- INSERT into `bounties` with fields from `IntelBountyCreatedEvent` (bounty_id, meta_id, creator, target_region, intel_types_wanted)
- Initial status: `0` (OPEN)
- `getObject(bounty_id)` call to supplement fields NOT in the event: `reward_amount`, `deadline`, `required_stake`, `max_claims`
- These fields are on the `Bounty<SUI>` object, not on the event struct

### Claim ticket data
- `ClaimTicketList` needs hunter addresses + stake amounts
- bounty_escrow does NOT emit a claim event that we can index
- Solution: `GET /api/bounties/:bountyId` handler supplements with `getObject(bounty_id)` to read `active_hunter_stakes` VecMap from on-chain bounty object
- This is a single RPC call per detail page load, acceptable overhead
- Cached in API response, not repeated on frontend

---

## 4. API Endpoints

All behind auth middleware (JWT). No tier-gating.

### `GET /api/bounties/active` (replace existing stub)
- Query: `SELECT * FROM bounties WHERE status < 5 AND deadline > ? ORDER BY created_at DESC`
- Response: `{ bounties: BountyRow[] }`

### `GET /api/bounties/:bountyId` (new)
- Query: bounty row + `SELECT * FROM bounty_events WHERE bounty_id = ? ORDER BY timestamp ASC`
- Response: `{ bounty: BountyRow, events: BountyEventRow[] }`
- 404 if not found

### `GET /api/bounties/by-creator/:address` (new)
- Query: `SELECT * FROM bounties WHERE creator = ? ORDER BY created_at DESC`
- Response: `{ bounties: BountyRow[] }`

### `GET /api/bounties/by-hunter/:address` (new)
- Query: `SELECT DISTINCT b.* FROM bounties b JOIN bounty_events e ON b.bounty_id = e.bounty_id WHERE e.hunter = ? ORDER BY b.updated_at DESC`
- Response: `{ bounties: BountyRow[] }`

---

## 5. Frontend Types

### New types (`types/index.ts`)

```typescript
interface BountyDetail extends BountyRequest {
  metaId: string;
  updatedAt: number;
  events: BountyEvent[];
  hunters: ClaimTicket[];   // from on-chain getObject() supplement
}

interface ClaimTicket {
  hunter: string;
  stakeAmount: number;      // MIST
}

interface BountyEvent {
  id: number;
  bountyId: string;
  eventType: 'proof_submitted' | 'proof_rejected' | 'proof_resubmitted'
           | 'dispute_raised' | 'dispute_resolved' | 'proof_auto_approved';
  hunter: string;
  actor: string;
  detail: ProofDetail | RejectDetail | DisputeDetail | ResolveDetail | null;
  timestamp: number;
  txDigest: string;
}

interface ProofDetail { proofUrl: string; proofDescription: string }
interface RejectDetail { reason: string }
interface DisputeDetail { reason: string }
interface ResolveDetail { approved: boolean }
```

---

## 6. PTB Builders

6 new builders in `lib/ptb/bounty.ts`. Deprecate existing `buildSubmitForBounty`.

| Builder | Move target | Package | Key params |
|---------|------------|---------|------------|
| `buildSubmitIntelProof` | `bounty::submit_intel_proof` | Explorer Hub | bountyId, metaId, intelId, proofUrl, proofDescription, clock |
| `buildResubmitIntelProof` | `bounty::resubmit_intel_proof` | Explorer Hub | bountyId, metaId, intelId, proofUrl, proofDescription, clock |
| `buildRejectProof` | `bounty_escrow::bounty::reject_proof` | Bounty Escrow | bountyId, hunter, reason, verifierCap, clock; typeArgs: [SUI_TYPE] |
| `buildDisputeRejection` | `bounty_escrow::bounty::dispute_rejection` | Bounty Escrow | bountyId, reason, clock; typeArgs: [SUI_TYPE] |
| `buildResolveDispute` | `bounty_escrow::bounty::resolve_dispute` | Bounty Escrow | bountyId, hunter, approved, clock; typeArgs: [SUI_TYPE] |
| `buildAutoApproveProof` | `bounty_escrow::bounty::auto_approve_proof` | Bounty Escrow | bountyId, clock; typeArgs: [SUI_TYPE] |

New constants in `lib/constants.ts`:
- `BOUNTY_ESCROW_PACKAGE_ID` — bounty_escrow package address
- `SUI_TYPE` — `"0x2::sui::SUI"` (type argument for generic bounty_escrow calls)

### VerifierCap acquisition
Creator role actions (`buildRejectProof`) require a `VerifierCap` object. The `useBountyDetail` hook must fetch the connected wallet's owned `VerifierCap` objects via `getOwnedObjects({ filter: { StructType: "${BOUNTY_ESCROW_PACKAGE_ID}::verifier::VerifierCap" } })` and match by `bounty_id` field. If no cap found, creator actions are disabled.

---

## 7. Frontend Pages + Components

### List page changes (`/bounties/page.tsx`)
- Bounty ID → clickable link to `/bounties/[id]`
- Add `status` column with StatusChip
- Tab switcher: **All Active** / **My Bounties** (creator) / **My Submissions** (hunter)
  - Tabs call `/active`, `/by-creator/:addr`, `/by-hunter/:addr` respectively
  - My Bounties / My Submissions tabs only visible when wallet connected

### Detail page (new: `/bounties/[id]/page.tsx`)

```
┌─────────────────────────────────────────┐
│ ← Back to Bounties                      │
│ BOUNTY #0x1a2b...  StatusChip RiskBadge │
├─────────────────────────────────────────┤
│ Info Panel                              │
│  Region / Types / Reward / Deadline /   │
│  Creator / Submissions                  │
├─────────────────────────────────────────┤
│ Claim Tickets Panel                     │
│  Hunters list with stake amounts        │
├─────────────────────────────────────────┤
│ Proof Timeline (vertical)              │
│  Events in chronological order          │
│  Each event: timestamp, actor, detail   │
│  Proof URLs clickable                   │
│  Tx digests link to suiscan explorer    │
│  CountdownTimer if review period active │
├─────────────────────────────────────────┤
│ Actions Panel (role-dependent)          │
│  Inline expand for reason/URL input     │
└─────────────────────────────────────────┘
```

### Role-based actions

| Role | Actions shown | Condition |
|------|--------------|-----------|
| Creator | Reject Proof, Resolve Dispute | proof status = submitted / disputed |
| Hunter (no proof) | Submit Intel Proof | has claimed but not submitted |
| Hunter (rejected) | Resubmit, Dispute Rejection | proof status = rejected |
| Hunter (submitted) | Auto Approve | review period expired |
| Viewer | None (read-only) | — |

Role detection (pure indexer data):
- `bounty.creator === walletAddress` → creator
- `events.some(e => e.hunter === walletAddress)` → hunter
- else → viewer

### Input patterns
- All action buttons use **inline expand** (not modal)
- proof_url: text input, ≤512 chars, character counter
- proof_description: textarea, ≤2048 chars, character counter (optional)
- reason (reject/dispute): textarea, ≤1024 chars, character counter
- resolve_dispute: two buttons (Approve Hunter / Side with Verifier)
- Confirm/Cancel button pair in expand area

### New components

| Component | Purpose |
|-----------|---------|
| `ProofTimeline` | Vertical timeline with left border, event cards, tx links |
| `ActionPanel` | Role-based action buttons + inline expand forms |
| `CountdownTimer` | Auto-approve countdown with urgency colors (cyan > yellow > red) |
| `ClaimTicketList` | Hunter addresses + stake amounts, highlight "(you)" |

### Reused components
- `StatusChip` — proof/bounty status tag
- `RiskBadge` — reward amount severity
- `Panel` — section container
- `PageHeader` — page title + breadcrumb

---

## 8. Hooks + API Client

### API client additions (`lib/api-client.ts`)
```typescript
getBountyDetail(bountyId: string): Promise<{ bounty: BountyDetail }>
getBountiesByCreator(address: string): Promise<{ bounties: BountyRequest[] }>
getBountiesByHunter(address: string): Promise<{ bounties: BountyRequest[] }>
```

### Hook changes

**`useBounties()` — extend existing:**
- Add `myBounties`, `mySubmissions` queries (enabled when wallet connected)
- Add `activeTab` / `setActiveTab` state for tab switching

**`useBountyDetail(bountyId)` — new hook:**
```typescript
{
  bounty: BountyDetail | null
  isLoading: boolean
  // mutations:
  submitProof(params): Promise
  resubmitProof(params): Promise
  rejectProof(params): Promise
  disputeRejection(params): Promise
  resolveDispute(params): Promise
  autoApproveProof(): Promise
  isSubmitting: boolean
  // derived:
  role: 'creator' | 'hunter' | 'viewer'
  currentProofStatus: string | null
  reviewDeadline: number | null
}
```

**Review deadline:** `latestProofEvent.timestamp + 72h (hardcoded)`

**Query invalidation:** All mutations invalidate `['bounty', bountyId]` + `['bounties']`

**Toast:** All mutations show success toast with tx digest link to `suiscan.xyz/testnet/tx/{digest}`

---

## 9. Review Period + Auto Approve

- Review period: **hardcode 72h** (259,200,000 ms)
- CountdownTimer shown when: `currentProofStatus === 'proof_submitted'` AND `Date.now() < reviewDeadline`
- Urgency color thresholds: `> 1h` cyan, `< 1h` yellow, `< 10min` red
- Auto Approve button visible when: hunter role AND `Date.now() > reviewDeadline`
- Countdown is UX-only; actual auto_approve eligibility enforced on-chain

---

## 10. Reference Implementation

Bounty Escrow Protocol frontend at:
`/projects/Bounty_Escrow_Protocol/frontend/`

Reusable patterns adopted:
- Collapsible inline forms (toggle state + conditional render)
- CountdownTimer with urgency colors and `setInterval` 1s update
- Role-based action component separation
- Event sourcing for rejection history
- Toast with tx digest explorer link
- PTB builder factory pattern (one function per transaction)
