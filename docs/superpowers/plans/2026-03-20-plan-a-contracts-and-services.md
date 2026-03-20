# Plan A: On-chain Contracts & Service Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete backend pipeline: Sui Move contracts for intel, subscription, access, bounty, and marketplace + off-chain indexer, heatmap aggregator, and tier-gated Data API.

**Architecture:** On-chain layer handles asset ownership, payments, and event emission. Off-chain service layer indexes events, aggregates heatmap data with privacy protection, and serves tier-gated API. All revenue flows to a single `SubscriptionConfig.treasury`.

**Tech Stack:** Sui Move (contracts), Node.js + TypeScript (service), SQLite (Hackathon DB), @mysten/sui (SDK), Express (API)

**Spec:** `docs/superpowers/specs/2026-03-20-frontier-explorer-hub-design.md`

---

## File Structure

### Move Contracts (`move/frontier_explorer_hub/`)

```
move/frontier_explorer_hub/
├── Move.toml
└── sources/
    ├── admin.move           — AdminCap, OTW, constants
    ├── intel.move            — IntelReport, GridCell, submit/expire
    ├── subscription.move     — SubscriptionNFT, SubscriptionConfig, pay/renew
    ├── access.move           — UnlockReceipt, PricingTable, unlock/verify
    ├── bounty.move           — BountyRequest, create/submit/refund
    ├── marketplace.move      — PluginRegistry, PluginListing, register/use
    └── tests/
        ├── admin_tests.move
        ├── intel_tests.move
        ├── subscription_tests.move
        ├── access_tests.move
        ├── bounty_tests.move
        └── marketplace_tests.move
```

### Service Layer (`services/`)

```
services/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              — entry point
│   ├── config.ts             — env vars, constants
│   ├── db/
│   │   ├── schema.ts         — SQLite schema
│   │   └── client.ts         — better-sqlite3 wrapper
│   ├── indexer/
│   │   ├── event-listener.ts — Sui event polling
│   │   ├── handlers.ts       — per-event-type processing
│   │   └── cursor.ts         — checkpoint management
│   ├── aggregator/
│   │   ├── pipeline.ts       — spatial bucketing + K-anonymity
│   │   └── scheduler.ts      — batch schedule
│   ├── api/
│   │   ├── server.ts         — Express app
│   │   ├── auth.ts           — JWT + tier lookup
│   │   ├── routes/
│   │   │   ├── heatmap.ts
│   │   │   ├── intel.ts
│   │   │   ├── subscription.ts
│   │   │   ├── bounties.ts
│   │   │   └── region.ts
│   │   └── middleware/
│   │       └── rate-limit.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── aggregator.test.ts
│   ├── handlers.test.ts
│   └── routes.test.ts
└── .env.example
```

---

## Task 1: Move Project Scaffold + Admin Module

**Files:**
- Create: `move/frontier_explorer_hub/Move.toml`
- Create: `move/frontier_explorer_hub/sources/admin.move`
- Create: `move/frontier_explorer_hub/sources/tests/admin_tests.move`

- [ ] **Step 1: Create Move.toml**

```toml
[package]
name = "frontier_explorer_hub"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
frontier_explorer_hub = "0x0"
```

> **SDK Version Note (2026-03-20):** Sui CLI 1.68.0, active env testnet. 使用 `framework/testnet` 追蹤 testnet 分支，避免固定過期版本。

- [ ] **Step 2: Write admin.move — OTW, AdminCap, constants, error codes**

Key contents:
- `ADMIN` OTW struct with `drop`
- `AdminCap` with `key, store`
- `init()` that creates AdminCap and transfers to deployer
- All constant definitions (intel types, severity, visibility, economic bounds)
- All error code definitions
- Public accessor functions for constants and errors
- `#[test_only] create_admin_cap_for_testing()`

- [ ] **Step 3: Write admin_tests.move**

Tests:
- `test_constants_valid()` — verify constant relationships
- `test_init_creates_admin_cap()` — verify test helper works

- [ ] **Step 4: Build and test**

Run: `cd move/frontier_explorer_hub && sui move build && sui move test`

- [ ] **Step 5: Commit**

```
feat(move): add project scaffold + admin module with OTW and constants
```

---

## Task 2: Intel Module — GridCell + IntelReport + Submit

**Files:**
- Create: `move/frontier_explorer_hub/sources/intel.move`
- Create: `move/frontier_explorer_hub/sources/tests/intel_tests.move`

- [ ] **Step 1: Write intel.move**

Key contents:
- `GridCell` struct: `store, copy, drop` — region_id, sector_x/y/z (u64), zoom_level
- `IntelReport` struct: `key` only (shared object) — reporter, location, raw_location_hash, intel_type, severity, timestamp, expiry, visibility, deposit (Balance<SUI>)
- `IntelSubmittedEvent` struct: `copy, drop`
- `submit_intel()` — validates severity/visibility/deposit, creates shared IntelReport, emits event
- `expire_intel()` — consumes IntelReport, refunds deposit to reporter
- `batch_submit()` — takes `vector<IntelParams>` (max 20), deposit = MIN_SUBMIT_DEPOSIT * batch_size, creates multiple shared IntelReports
- `update_visibility()` — asserts sender == reporter
- Accessor functions for all fields
- `new_grid_cell()` constructor
- `is_in_region()` for bounty verification

> Note: `IntelParams` is a helper struct with `store, copy, drop` containing all submit fields except deposit.

- [ ] **Step 2: Write intel_tests.move**

Tests:
- `test_submit_intel_success()` — happy path
- `test_submit_intel_invalid_severity()` — severity > 10 aborts
- `test_submit_intel_insufficient_deposit()` — deposit too small aborts
- `test_submit_intel_invalid_visibility()` — bad visibility aborts
- `test_update_visibility_not_reporter()` — wrong sender aborts
- `test_batch_submit_success()` — batch of 3, verify all created

- [ ] **Step 3: Build and test**

Run: `cd move/frontier_explorer_hub && sui move build && sui move test`

- [ ] **Step 4: Commit**

```
feat(move): add intel module with GridCell, IntelReport, submit/expire
```

---

## Task 3: Subscription Module

**Files:**
- Create: `move/frontier_explorer_hub/sources/subscription.move`
- Create: `move/frontier_explorer_hub/sources/tests/subscription_tests.move`

- [ ] **Step 1: Write subscription.move**

Key contents:
- `SubscriptionNFT`: `key, store` — tier, started_at, expires_at (transferable intentionally)
- `SubscriptionConfig`: `key` (shared) — premium_price_per_day, treasury (Balance<SUI>)
- `SubscriptionCreatedEvent`: `copy, drop`
- `create_config()` — creates shared SubscriptionConfig
- `subscribe()` — pay SUI, mint NFT, return excess
- `renew()` — extend expiry (from now if expired, otherwise append)
- `is_active_premium()` — check tier + expiry against Clock
- `withdraw_treasury()` — requires AdminCap
- `upgrade()` — takes existing Free-tier NFT + payment, upgrades to Premium tier
- `set_price_per_day()` — requires AdminCap, enforces MIN/MAX bounds
- `treasury_mut()` accessor for access module to deposit platform share
- `#[test_only] create_config_for_testing()`

- [ ] **Step 2: Write subscription_tests.move**

Tests:
- `test_subscribe_and_check_premium()` — subscribe, verify active, fast-forward past expiry, verify inactive
- `test_renew_extends_expiry()` — subscribe 1 day, renew 7 days, verify 8 days total
- `test_upgrade_free_to_premium()` — upgrade from free tier, verify tier changed
- `test_set_price_below_minimum()` — setting price below floor aborts

- [ ] **Step 3: Build and test**

Run: `cd move/frontier_explorer_hub && sui move test`

- [ ] **Step 4: Commit**

```
feat(move): add subscription module with NFT, config, pay/renew/verify
```

---

## Task 4: Access Module — Unlock + Revenue Split

**Files:**
- Create: `move/frontier_explorer_hub/sources/access.move`
- Create: `move/frontier_explorer_hub/sources/tests/access_tests.move`

- [ ] **Step 1: Write access.move**

Key contents:
- `UnlockReceipt`: `key, store` — original_buyer, intel_id, unlocked_at, price_paid
- `PricingTable`: `key` (shared) — base_unlock_price, type_multipliers (VecMap<u8, u64>), reporter_share_bps
- `IntelUnlockedEvent`: `copy, drop`
- `create_pricing_table()` — shared object
- `unlock_intel()` — takes PricingTable, SubscriptionConfig (for treasury), IntelReport, Coin<SUI>, max_price. Calculates price with type multiplier. Asserts max_price >= price (slippage protection). Splits coin: reporter_share to intel.reporter, platform_share to treasury. Returns excess. Mints UnlockReceipt.
- `set_pricing()` — AdminCap required
- `set_reporter_share()` — AdminCap required, enforces MIN/MAX bounds
- `set_type_multiplier()` — AdminCap required
- `verify_access(nft: &SubscriptionNFT, clock: &Clock): bool` — unified access check (delegates to `is_active_premium`)
- Internal `calculate_price()` — base * multiplier / 100
- `#[test_only] create_pricing_table_for_testing()`

- [ ] **Step 2: Write access_tests.move**

Tests:
- `test_unlock_intel_revenue_split()` — verify 70/30 split: reporter gets 70%, treasury gets 30%
- `test_unlock_intel_slippage_protection()` — max_price too low aborts
- `test_set_reporter_share_out_of_range()` — bps > 9000 aborts

- [ ] **Step 3: Build and test**

Run: `cd move/frontier_explorer_hub && sui move test`

- [ ] **Step 4: Commit**

```
feat(move): add access module with unlock, revenue split, slippage protection
```

---

## Task 5: Bounty Module

**Files:**
- Create: `move/frontier_explorer_hub/sources/bounty.move`
- Create: `move/frontier_explorer_hub/sources/tests/bounty_tests.move`

- [ ] **Step 1: Write bounty.move**

Key contents:
- `IntelSubmission`: `store, drop, copy` — intel_id, submitter
- `BountyRequest`: `key` only (shared, contains Balance<SUI>) — requester, target_region (GridCell), intel_types_wanted, reward_amount, escrow, deadline, status, submissions vector
- Status constants: OPEN=0, SUBMITTED=1, COMPLETED=2, EXPIRED=3
- `BountyCreatedEvent`, `BountyCompletedEvent`: `copy, drop`
- `create_bounty()` — lock SUI in escrow, share object
- `submit_for_bounty()` — atomic: verify bounty open + not expired + sender == intel.reporter (anti-frontrunning) + intel_type matches + region matches. Release escrow, set completed.
- `refund_expired_bounty()` — consumes BountyRequest if expired + open, refunds escrow, deletes object
- `cleanup_completed_bounty()` — consumes completed bounty, deletes object

- [ ] **Step 2: Write bounty_tests.move**

Tests:
- `test_bounty_full_lifecycle()` — create bounty → explorer submits intel → claims → verify reward received
- `test_bounty_refund_on_expiry()` — create → fast-forward past deadline → refund
- `test_frontrunning_rejected()` — attacker tries to claim with someone else's intel → aborts

- [ ] **Step 3: Build and test**

Run: `cd move/frontier_explorer_hub && sui move test`

- [ ] **Step 4: Commit**

```
feat(move): add bounty module with escrow, anti-frontrunning, expiry refund
```

---

## Task 6: Marketplace Module (Plugin Registry)

**Files:**
- Create: `move/frontier_explorer_hub/sources/marketplace.move`
- Create: `move/frontier_explorer_hub/sources/tests/marketplace_tests.move`

- [ ] **Step 1: Write marketplace.move**

Key contents:
- `PluginListing`: `store` — developer, manifest_hash, price_per_use, revenue_split_bps, active, registered_at
- `PluginRegistry`: `key` (shared) — plugins (Table<ID, PluginListing>), platform_fee_bps
- `PluginUsageReceipt`: `key, store` — user, plugin_id, paid, timestamp
- `PluginRegisteredEvent`, `PluginUsedEvent`: `copy, drop`
- `create_registry()` — shared object
- `register_plugin()` — developer registers, generates plugin_id
- `use_plugin()` — user pays, revenue split (developer/platform), mint receipt
- `deactivate_plugin()` — developer only
- `remove_plugin()` — AdminCap required
- `#[test_only] create_registry_for_testing()`

- [ ] **Step 2: Write marketplace_tests.move**

Tests:
- `test_register_plugin()` — developer registers successfully
- `test_deactivate_plugin()` — developer deactivates, verify active=false
- `test_deactivate_plugin_not_developer()` — non-developer cannot deactivate → aborts
- `test_remove_plugin_requires_admin()` — remove without AdminCap → aborts

- [ ] **Step 3: Build and test**

Run: `cd move/frontier_explorer_hub && sui move test`

- [ ] **Step 4: Commit**

```
feat(move): add marketplace module for plugin registry and revenue split
```

---

## Task 7: Service Layer Scaffold + DB Schema

**Files:**
- Create: `services/package.json`, `services/tsconfig.json`, `services/.env.example`
- Create: `services/src/config.ts`
- Create: `services/src/types/index.ts`
- Create: `services/src/db/schema.ts`, `services/src/db/client.ts`

- [ ] **Step 1: Initialize Node.js project**

```bash
cd services && npm init -y
npm install better-sqlite3 express cors jsonwebtoken @mysten/sui dotenv
npm install -D typescript @types/node @types/express @types/cors @types/better-sqlite3 @types/jsonwebtoken vitest
```

- [ ] **Step 2: Create tsconfig.json, .env.example, config.ts, types/index.ts**

Config: SUI_RPC_URL, PACKAGE_ID, JWT_SECRET, PORT, K_ANONYMITY_THRESHOLD, FREE_TIER_DELAY_MS

Types: GridCell, IntelReport, AggregatedCell, SubscriptionTier, HeatmapQuery, TierGatedResponse

- [ ] **Step 3: Create db/schema.ts + db/client.ts**

Tables: intel_reports, heatmap_cache, subscriptions, unlock_receipts, event_cursor, aggregation_anchors
Indexes: region+zoom, timestamp, expiry, owner
Client: better-sqlite3 wrapper with WAL mode

- [ ] **Step 4: Commit**

```
feat(services): scaffold Node.js project with DB schema, types, config
```

---

## Task 8: Event Indexer

**Files:**
- Create: `services/src/indexer/event-listener.ts`
- Create: `services/src/indexer/handlers.ts`
- Create: `services/src/indexer/cursor.ts`
- Create: `services/tests/handlers.test.ts`

- [ ] **Step 1: Write cursor.ts** — get/save event cursor from DB

- [ ] **Step 2: Write handlers.ts** — handleIntelSubmitted, handleSubscriptionCreated, handleIntelUnlocked (INSERT OR IGNORE into respective tables)

- [ ] **Step 3: Write event-listener.ts** — poll-based indexing using SuiClient.queryEvents(), process each event type, save cursor

- [ ] **Step 4: Write handlers.test.ts** — test insert, test duplicate ignore

- [ ] **Step 5: Run tests**

Run: `cd services && npx vitest run tests/handlers.test.ts`

- [ ] **Step 6: Commit**

```
feat(services): add event indexer with cursor management and handlers
```

---

## Task 9: Heatmap Aggregator

**Files:**
- Create: `services/src/aggregator/pipeline.ts`
- Create: `services/src/aggregator/scheduler.ts`
- Create: `services/tests/aggregator.test.ts`

- [ ] **Step 1: Write pipeline.ts**

Key functions:
- `makeCellKey()` — deterministic cell key from grid coords
- `aggregateHeatmap()` — clear expired, GROUP BY cell+type, apply K-anonymity suppression, write to heatmap_cache
- `getHeatmapData()` — read from cache, apply tier gating (free: delayed + no type breakdown; premium: full data)

- [ ] **Step 2: Write scheduler.ts** — initial run + setInterval for batch recompute

- [ ] **Step 3: Write aggregator.test.ts**

Tests:
- `makeCellKey` determinism
- K-anonymity: < K reporters → suppressed
- K-anonymity: >= K reporters → not suppressed
- Tier gating: free has no type breakdown, premium has full data

- [ ] **Step 4: Run tests**

Run: `cd services && npx vitest run tests/aggregator.test.ts`

- [ ] **Step 5: Commit**

```
feat(services): add heatmap aggregator with spatial bucketing and K-anonymity
```

---

## Task 10: Data API — Express Routes + Auth + Tier Gating

**Files:**
- Create: `services/src/api/server.ts`
- Create: `services/src/api/auth.ts`
- Create: `services/src/api/routes/heatmap.ts`
- Create: `services/src/api/routes/intel.ts`
- Create: `services/src/api/routes/subscription.ts`
- Create: `services/src/api/routes/bounties.ts`
- Create: `services/src/api/routes/region.ts`
- Create: `services/src/api/middleware/rate-limit.ts`
- Create: `services/src/index.ts`

- [ ] **Step 1: Write auth.ts** — JWT verify, tier lookup from subscriptions table, attach to request

- [ ] **Step 2: Write rate-limit.ts** — in-memory counter per wallet/IP, 10/min free, 100/min premium

- [ ] **Step 3: Write routes** — heatmap (tier-gated zoom), intel (locked/unlocked), subscription status, bounties (placeholder), region summary

- [ ] **Step 4: Write server.ts** — Express app with cors, auth, rate-limit, all routes

- [ ] **Step 5: Write index.ts** — starts indexer, aggregator, API server

- [ ] **Step 6: Type check**

Run: `cd services && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```
feat(services): add Data API with auth, tier gating, rate limiting, all routes
```

---

## Task 11: Integration Test — Full Pipeline

**Files:**
- Create: `services/tests/routes.test.ts`

- [ ] **Step 1: Write API integration tests**

Tests:
- Free tier only sees zoom 0-1
- Region summary returns aggregated stats
- Intel endpoint returns locked data without receipt

- [ ] **Step 2: Run all tests**

Run: `cd services && npx vitest run`

- [ ] **Step 3: Commit**

```
test(services): add integration tests for API tier gating and region summary
```

---

## Task 12: Monkey Tests — Move Contracts

**Files:**
- Modify: `move/frontier_explorer_hub/sources/tests/intel_tests.move`
- Modify: `move/frontier_explorer_hub/sources/tests/subscription_tests.move`
- Modify: `move/frontier_explorer_hub/sources/tests/access_tests.move`
- Modify: `move/frontier_explorer_hub/sources/tests/bounty_tests.move`
- Modify: `move/frontier_explorer_hub/sources/tests/marketplace_tests.move`

Per project test rules: "Unit-Test 和 Integration Test 完之後，一定要做 Monkey Testing"

- [ ] **Step 1: Intel monkey tests**

- `test_monkey_max_severity_boundary()` — severity = 10 succeeds, 11 fails
- `test_monkey_zero_deposit()` — deposit = 0 fails
- `test_monkey_max_u64_coordinates()` — sector_x/y/z = u64::MAX succeeds (valid input)
- `test_monkey_empty_location_hash()` — empty vector as hash succeeds (no constraint)

- [ ] **Step 2: Subscription monkey tests**

- `test_monkey_subscribe_zero_days()` — 0 days should work (cost = 0)
- `test_monkey_subscribe_max_u64_days()` — overflow check on expiry calculation
- `test_monkey_renew_expired_subscription()` — renew should restart from now

- [ ] **Step 3: Access monkey tests**

- `test_monkey_unlock_same_intel_twice()` — second unlock succeeds (feature, not bug)
- `test_monkey_unlock_zero_price_type()` — if no multiplier set, base price used

- [ ] **Step 4: Bounty monkey tests**

- `test_monkey_bounty_reward_zero()` — should fail (assert reward > 0)
- `test_monkey_bounty_deadline_in_past()` — should fail
- `test_monkey_double_claim()` — second submit_for_bounty on completed bounty fails
- `test_monkey_refund_completed_bounty()` — refunding a completed bounty fails

- [ ] **Step 5: Marketplace monkey tests**

- `test_monkey_use_deactivated_plugin()` — should fail
- `test_monkey_register_zero_price_plugin()` — free plugin, verify no revenue split

- [ ] **Step 6: Run all tests**

Run: `cd move/frontier_explorer_hub && sui move test`
Expected: ALL TESTS PASSED

- [ ] **Step 7: Commit**

```
test(move): add monkey tests for extreme inputs and edge cases
```

---

## Task 13: Monkey Tests — Service Layer

**Files:**
- Create: `services/tests/monkey.test.ts`

- [ ] **Step 1: Write service layer monkey tests**

Tests:
- Indexer: duplicate event handling (insert same intel_id twice → only 1 row)
- Indexer: event with missing fields → handler doesn't crash
- Aggregator: zero intel reports → empty heatmap, no crash
- Aggregator: single reporter (below K threshold) → cell suppressed
- API: invalid JWT → defaults to free tier (not error)
- API: expired JWT → defaults to free tier
- API: free tier requesting zoom level 2 → 403
- API: rate limit boundary → 10th request OK, 11th rejected
- API: missing authorization header → free tier response

- [ ] **Step 2: Run all service tests**

Run: `cd services && npx vitest run`

- [ ] **Step 3: Commit**

```
test(services): add monkey tests for extreme inputs and edge cases
```

---

## Task 14: AggregationAnchor (On-chain Verifiable Aggregation)

**Files:**
- Modify: `move/frontier_explorer_hub/sources/intel.move` (add AggregationAnchor struct)
- Modify: `services/src/aggregator/pipeline.ts` (add merkle root computation)
- Modify: `services/src/db/schema.ts` (aggregation_anchors table already added in Task 7)

- [ ] **Step 1: Add AggregationAnchor struct to intel.move**

```move
public struct AggregationAnchor has key {
    id: UID,
    merkle_root: vector<u8>,
    report_count: u64,
    timestamp: u64,
    zoom_level: u8,
}

public fun create_anchor(
    _admin: &AdminCap,
    merkle_root: vector<u8>,
    report_count: u64,
    zoom_level: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    transfer::share_object(AggregationAnchor {
        id: object::new(ctx),
        merkle_root,
        report_count,
        timestamp: clock.timestamp_ms(),
        zoom_level,
    });
}
```

- [ ] **Step 2: Add simple hash computation to aggregator pipeline**

After batch aggregation, compute SHA-256 of sorted cell data as anchor hash. Store in `aggregation_anchors` table.

- [ ] **Step 3: Build and test**

Run: `cd move/frontier_explorer_hub && sui move build && sui move test`
Run: `cd services && npx vitest run`

- [ ] **Step 4: Commit**

```
feat: add AggregationAnchor for verifiable heatmap aggregation
```

---

## Design Deviations from Spec

| Deviation | Reason |
|-----------|--------|
| OTW named `ADMIN` (matches module name) instead of `FRONTIER_EXPLORER_HUB` | Sui requires OTW name to match module name. Each module has its own init; shared objects created per-module via `create_*()` functions instead of single init. |
| Poll-based event indexing instead of WebSocket | More reliable for hackathon; WebSocket can drop connections. Same result, just different transport. |
| Tests in `sources/tests/` instead of `tests/` | Both work in Sui Move. Using `sources/tests/` keeps test files adjacent to source. |

---

## Summary

| Task | Module | What it builds |
|------|--------|---------------|
| 1 | admin.move | OTW, AdminCap, constants, error codes |
| 2 | intel.move | GridCell, IntelReport, submit/batch_submit/expire |
| 3 | subscription.move | SubscriptionNFT, Config, subscribe/renew/upgrade |
| 4 | access.move | UnlockReceipt, PricingTable, unlock + revenue split + verify_access |
| 5 | bounty.move | BountyRequest, escrow, anti-frontrunning, refund |
| 6 | marketplace.move | PluginRegistry, register/use/deactivate |
| 7 | services scaffold | package.json, DB schema (6 tables), types, config |
| 8 | indexer | Event listener, handlers, cursor management |
| 9 | aggregator | Spatial bucketing, K-anonymity, scheduler |
| 10 | API | Express routes, auth, tier gating, rate limiting |
| 11 | integration test | Full pipeline test |
| 12 | monkey tests (Move) | Extreme inputs, boundary values, edge cases |
| 13 | monkey tests (services) | Duplicate events, invalid JWT, rate limit edges |
| 14 | AggregationAnchor | On-chain verifiable aggregation hash |
