# Frontier Explorer Hub — System Design Spec

> Status: Approved
> Date: 2026-03-20
> Scope: Hackathon 實作 Phase B (訂閱合約 + 熱力圖 + Bounty 整合)，架構設計 Phase C (dApp Store 擴展)

---

## 1. Overview

Frontier Explorer Hub 是一個結合「情報販售、威脅雷達與外部 App Store」的聚合星圖平台。核心產品為 **Privacy-Preserving Heatmap**，作為串聯各生態的 DaaS (Data-as-a-Service) 數據服務引擎。

### 1.1 Core Value Loop

```
Explorer 提交情報 → 聚合為熱力圖 → 訂閱者付費消費
    ↑                                      │
    └──── 分潤收入 ← 單次解鎖 ← 資訊需求 ←─┘
```

### 1.2 Key Decisions

| 決策項 | 結論 |
|--------|------|
| 實作 scope | B (訂閱合約 + 熱力圖 + Bounty 整合)，架構 C (dApp Store) |
| 資料架構 | Hybrid (鏈上 intel + off-chain indexer)，預留 Walrus 接口 |
| 付費模型 | 混合制：時間訂閱 + 單次增值付費 |
| 隱私策略 | Spatial Bucketing + K-anonymity + 時間延遲，預留差分隱私接口 |
| 前端 | Next.js + create-eve-dapp scaffold |
| 星圖 | deck.gl，保留 D3.js 遷移路徑 |
| Bounty 整合 | Interface-first，mock module 做 Hackathon demo |

---

## 2. System Architecture

三層架構：Client → Service (off-chain) → On-chain (Sui Move)。

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│  Star Map UI │ Subscription UI │ Intel Submit │ Plugin Store │
│  (deck.gl)   │  (pay/upgrade)  │ (upload)     │ (iframe SDK) │
└──────────────────────┬──────────────────────────────────────┘
                       │ Next.js + @mysten/dapp-kit
┌──────────────────────▼──────────────────────────────────────┐
│                    SERVICE LAYER                             │
│  Heatmap Aggregator │ Event Indexer │ Data API               │
│  (bucketing + K-anon)│ (Sui events) │ (REST, tier-gated)    │
│                      │              │ [Future: Walrus]       │
└──────────────────────┬──────────────────────────────────────┘
                       │ Sui RPC + Event Subscription
┌──────────────────────▼──────────────────────────────────────┐
│                    ON-CHAIN LAYER                             │
│  intel module │ subscription module │ access module            │
│               │ marketplace module  │                         │
│  ──── bounty_interface (→ Bounty_Escrow_Protocol) ────       │
└─────────────────────────────────────────────────────────────┘
```

Legend: `[brackets]` = future extension, not implemented in Hackathon.

---

## 3. On-chain Contract Design (Sui Move)

### 3.0 Shared Admin & Constants

```move
/// One-time witness — Sui guarantees exactly one instance per module publish
public struct FRONTIER_EXPLORER_HUB has drop {}

/// Admin capability — minted exactly once in init(), transferred to deployer
public struct AdminCap has key, store {
    id: UID,
}

/// Module initializer — called exactly once on publish
fun init(otw: FRONTIER_EXPLORER_HUB, ctx: &mut TxContext) {
    // OTW consumed (dropped) to prove single execution
    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, tx_context::sender(ctx));

    // Create shared objects
    transfer::share_object(SubscriptionConfig {
        id: object::new(ctx),
        premium_price_per_day: 1_000_000_000, // 1 SUI/day default
        treasury: balance::zero(),
    });
    transfer::share_object(PricingTable {
        id: object::new(ctx),
        base_unlock_price: 100_000_000, // 0.1 SUI default
        type_multipliers: vec_map::empty(),
        reporter_share_bps: 7000, // 70% to reporter
    });
}

/// Intel type constants
const INTEL_RESOURCE: u8 = 0;
const INTEL_THREAT: u8 = 1;
const INTEL_WRECKAGE: u8 = 2;
const INTEL_POPULATION: u8 = 3;

/// Severity range: 0-10 (0=minimal, 10=extreme)
const MAX_SEVERITY: u8 = 10;

/// Visibility constants
const VIS_PUBLIC: u8 = 0;
const VIS_PRIVATE: u8 = 1;
// Future: VIS_TRIBE = 2, VIS_ALLIANCE = 3 (requires tribe/alliance registry)

/// Economic safety bounds (enforced in set_pricing / set_reporter_share)
const MIN_REPORTER_SHARE_BPS: u64 = 1000;  // reporter gets at least 10%
const MAX_REPORTER_SHARE_BPS: u64 = 9000;  // platform gets at least 10%
const MIN_PRICE_PER_DAY: u64 = 100_000_000;    // 0.1 SUI floor
const MAX_PRICE_PER_DAY: u64 = 100_000_000_000; // 100 SUI ceiling

/// Anti-spam: minimum SUI deposit required per intel submission (refundable if quality passes)
const MIN_SUBMIT_DEPOSIT: u64 = 10_000_000;  // 0.01 SUI
```

> **Hackathon scope:** Visibility limited to `public` (0) and `private` (1). Tribe/alliance-based visibility deferred to post-hackathon (requires on-chain tribe membership registry).

### 3.1 `intel` module

Core object representing a piece of intelligence submitted by an explorer.

**Object access pattern:** `IntelReport` is created as a **shared object** (via `transfer::share_object`) so that any user can reference it in their PTB for `unlock_intel()` or `submit_for_bounty()`. If it were owned by the reporter, other users could not include it in their transactions — this is a fundamental Sui constraint.

```move
/// Shared object — anyone can reference in PTB for unlock/bounty operations
public struct IntelReport has key {
    id: UID,
    reporter: address,
    location: GridCell,
    raw_location_hash: vector<u8>,  // hash of exact coords, not public
    intel_type: u8,                 // 0=resource, 1=threat, 2=wreckage, 3=population
    severity: u8,                   // 0-10
    timestamp: u64,
    expiry: u64,
    visibility: u8,                 // 0=public, 1=private (Hackathon scope)
    tribe_id: Option<address>,      // reserved for future tribe visibility
    deposit: Balance<SUI>,          // anti-spam stake, refunded on expiry
}

public struct GridCell has store, copy, drop {
    region_id: u64,
    sector_x: u64,                  // u64 to match EVE coordinate space
    sector_y: u64,                  // Note: if EVE uses signed coords, encode as i64 + 2^63 offset
    sector_z: u64,
    zoom_level: u8,                 // 0=frontier, 1=region, 2=system
}

/// Event structs (emitted, not stored)
public struct IntelSubmittedEvent has copy, drop {
    intel_id: ID,
    reporter: address,
    location: GridCell,
    intel_type: u8,
    severity: u8,
    timestamp: u64,
    visibility: u8,
}
```

> `IntelReport` has `key` only (no `store`) — it is always a top-level shared object, never wrapped or transferred. Contains `Balance<SUI>` deposit, so `store` is intentionally omitted (same pattern as `BountyRequest`).

**Functions:**
- `submit_intel(clock: &Clock, deposit: Coin<SUI>, ...)` — create IntelReport as shared object, emit `IntelSubmittedEvent`. Requires `MIN_SUBMIT_DEPOSIT` as anti-spam stake (stored in IntelReport, refunded on expiry to reporter). Asserts `tx_context::sender()` as reporter.
- `batch_submit(clock: &Clock, deposit: Coin<SUI>, params: vector<IntelParams>)` — batch submit (max 20 per tx). Deposit = `MIN_SUBMIT_DEPOSIT * batch_size`.
- `expire_intel(intel: IntelReport)` — consume and delete expired report, refund deposit to `intel.reporter`, reclaim storage rebate
- `update_visibility(intel: &mut IntelReport, ctx: &TxContext)` — change visibility scope. Asserts `tx_context::sender(ctx) == intel.reporter`.

**Dedup strategy: off-chain (Hackathon scope).**

The indexer handles dedup instead of on-chain. Rationale:
- An on-chain shared `IntelRegistry` with `&mut` on every submit creates a serialization bottleneck under concurrent submissions
- The indexer already tracks all submissions and can filter duplicates before aggregation
- K-anonymity filter already suppresses low-reporter-count data
- For production, consider per-reporter owned `ReporterState` objects (no shared contention) or sharded registries

**Constraints:**
- `severity` must be in range `0..=MAX_SEVERITY`
- `raw_location_hash` stores hash of precise coords for future verification without exposing individual position
- `sector_x/y/z` use `u64` to accommodate EVE Frontier's coordinate space (to be verified against world contracts; if signed coords needed, use offset encoding)

### 3.2 `subscription` module

```move
public struct SubscriptionNFT has key, store {
    id: UID,
    tier: u8,                       // 0=free, 1=premium
    started_at: u64,
    expires_at: u64,
}
// Note: no `owner` field — Sui runtime tracks ownership.
// If NFT is transferred, the new holder inherits the subscription.

/// Shared object — created in init(), holds pricing config and all platform revenue
public struct SubscriptionConfig has key {
    id: UID,
    premium_price_per_day: u64,
    treasury: Balance<SUI>,         // all platform revenue flows here (subscriptions + unlock platform share)
}

public struct SubscriptionCreatedEvent has copy, drop {
    subscription_id: ID,
    subscriber: address,
    tier: u8,
    expires_at: u64,
}
```

> `auto_renew` removed from Hackathon scope. Sui Move has no cron — auto-renewal would require either a keeper bot or lazy-evaluation on next access. Defer to post-hackathon.

**Functions:**
- `subscribe(config: &mut SubscriptionConfig, payment: Coin<SUI>, days: u64)` — pay SUI, mint Premium SubscriptionNFT
- `renew(config: &mut SubscriptionConfig, nft: &mut SubscriptionNFT, payment: Coin<SUI>, days: u64)` — extend expiry
- `upgrade(config: &mut SubscriptionConfig, nft: &mut SubscriptionNFT, payment: Coin<SUI>)` — Free → Premium
- `is_active_premium(nft: &SubscriptionNFT, clock: &Clock): bool` — query by passing owned NFT as reference
- `withdraw_treasury(admin: &AdminCap, config: &mut SubscriptionConfig, amount: u64): Coin<SUI>` — admin withdraws revenue

**Access pattern:** `is_active_premium()` takes `&SubscriptionNFT` as argument — the caller (user) must pass their own NFT into the transaction. This is the Sui-native pattern: modules cannot arbitrarily read owned objects, so the NFT must be an explicit parameter in the PTB.

**Transferability:** `SubscriptionNFT` has `store` so it is transferable. This is **intentional** — it enables a secondary market for subscriptions, which aligns with EVE's free-market economy worldview. The risk of discounted resale is accepted as a feature of the information economy.

### 3.3 `access` module

Handles single-purchase unlocks and unified access verification.

```move
public struct UnlockReceipt has key, store {
    id: UID,
    original_buyer: address,        // tracks who originally paid (immutable even if transferred)
    intel_id: ID,
    unlocked_at: u64,
    price_paid: u64,
}

/// Shared object — created in init()
public struct PricingTable has key {
    id: UID,
    base_unlock_price: u64,
    type_multipliers: VecMap<u8, u64>,
    reporter_share_bps: u64,       // revenue split in basis points (e.g., 7000 = 70%)
}

public struct IntelUnlockedEvent has copy, drop {
    receipt_id: ID,
    buyer: address,
    intel_id: ID,
    price_paid: u64,
    reporter_share: u64,
}
```

**Functions:**
- `unlock_intel(pricing: &PricingTable, treasury: &mut SubscriptionConfig, intel: &IntelReport, payment: Coin<SUI>, max_price: u64)` — pay to unlock with slippage protection (`max_price` caps the price user is willing to pay, prevents front-run price changes). `coin::split` payment into reporter share (transferred to `intel.reporter` via `transfer::public_transfer`) and platform share (merged into `treasury.treasury` via `balance::join`). Mint UnlockReceipt to buyer. Excess coin returned to sender.
- `verify_access(nft: &SubscriptionNFT, clock: &Clock): bool` — check if subscription is active Premium. For single-unlock verification, the frontend checks whether the user owns an `UnlockReceipt` with matching `intel_id` (off-chain query via indexer, on-chain the Receipt object itself is proof)
- `set_pricing(admin: &AdminCap, pricing: &mut PricingTable, ...)` — admin pricing adjustment
- `set_reporter_share(admin: &AdminCap, pricing: &mut PricingTable, bps: u64)` — admin adjusts revenue split

**Revenue split:** Default `reporter_share_bps = 7000` (70% to reporter, 30% to platform). Configurable by admin. This creates a flywheel incentivizing more submissions.

**Access verification pattern:** On-chain, access is proven by _possessing_ the object:
- Premium access: user includes their `SubscriptionNFT` in the PTB, contract checks `expires_at`
- Single unlock: user owns an `UnlockReceipt` with the matching `intel_id`
- The Data API verifies off-chain by querying the indexer for the user's subscription/receipt state

### 3.4 `bounty_interface` module (Mock for Hackathon)

```move
/// Shared object — created via share_object so any explorer can submit against it.
/// No `store` ability — Balance<SUI> inside requires explicit extraction (escrow safety).
public struct BountyRequest has key {
    id: UID,
    requester: address,
    target_region: GridCell,
    intel_types_wanted: vector<u8>,
    reward_amount: u64,
    escrow: Balance<SUI>,
    deadline: u64,
    status: u8,                     // 0=open, 1=submitted, 2=completed, 3=expired
    submissions: vector<IntelSubmission>,  // tracks all submissions for this bounty
}

/// Stored inside BountyRequest.submissions vector
public struct IntelSubmission has store, drop, copy {
    intel_id: ID,
    submitter: address,
}

public struct BountyCreatedEvent has copy, drop {
    bounty_id: ID,
    requester: address,
    target_region: GridCell,
    reward_amount: u64,
    deadline: u64,
}

public struct BountyCompletedEvent has copy, drop {
    bounty_id: ID,
    explorer: address,
    intel_id: ID,
    reward_amount: u64,
}
```

**Functions:**
- `create_bounty(payment: Coin<SUI>, ...)` — lock SUI in escrow, create as **shared object**, emit `BountyCreatedEvent`
- `submit_for_bounty(bounty: &mut BountyRequest, intel: &IntelReport, clock: &Clock, ctx: &TxContext)` — submit intel against a bounty; takes `&IntelReport` (shared object) to verify: `intel.intel_type ∈ bounty.intel_types_wanted`, `intel.location` within `bounty.target_region`, `clock.timestamp ≤ bounty.deadline`, **`intel.reporter == tx_context::sender(ctx)`** (only the reporter themselves can submit their intel for a bounty — prevents front-running by copying another reporter's data). On valid submission: auto-releases escrow to sender, sets status=completed, emits `BountyCompletedEvent`.
- `refund_expired_bounty(bounty: BountyRequest, clock: &Clock)` — anyone can call; if `clock.timestamp > deadline && status == open`, extract escrow and transfer to `bounty.requester`. **Consumes and deletes** the BountyRequest object (reclaims storage rebate).
- `cleanup_completed_bounty(bounty: BountyRequest)` — delete a completed bounty object (status == completed, escrow already drained). Returns storage rebate to caller.

> **Front-running mitigation:** `submit_for_bounty` asserts `intel.reporter == sender` — a front-runner cannot copy someone else's pending intel data and claim the bounty, because the IntelReport object records the original reporter. The front-runner would need to have independently scouted the same location.

> **Authorization:** `submit_for_bounty` combines submission + verification + release into one atomic call. No separate `verify_and_release` — this prevents the requester from blocking payout by refusing to verify. First valid submission wins.

**Migration path:** When `Bounty_Escrow_Protocol` is ready, replace import path. Interface structs remain identical.

---

## 4. Service Layer (Off-chain)

### 4.1 Event Indexer

Listens to Sui events via WebSocket subscription, writes to local database.

**Monitored events:** `IntelSubmittedEvent`, `SubscriptionCreatedEvent`, `IntelUnlockedEvent`

**Storage:** SQLite (Hackathon) → PostgreSQL + TimescaleDB (production)

**Core tables:**

| Table | Purpose |
|-------|---------|
| `intel_reports` | Indexed copy of all on-chain intel |
| `heatmap_cache` | Pre-computed aggregations per zoom level |
| `subscriptions` | Active subscription state snapshot |
| `unlock_receipts` | Unlock history |
| `aggregation_anchors` | Aggregation hash ↔ on-chain anchor |

**Resilience:** Stores last processed event cursor. On restart, resumes from checkpoint.

### 4.2 Heatmap Aggregator

Pipeline: `Raw Intel → Spatial Bucketing → K-Anonymity Filter → Time Delay (Free) → Output`

```typescript
interface AggregatedCell {
    cell: GridCell;
    total_reports: number;
    reporter_count: number;
    suppressed: boolean;            // true if reporter_count < K
    by_type: Record<IntelType, number>;  // Premium only
    avg_severity: number;                // Premium only
    latest_timestamp: number;
}
```

**Aggregation schedule:**
- Real-time: incremental update on each new event
- Batch: full recompute every 5 minutes (handles expiry cleanup)

**Anchoring:** After each batch, compute Merkle root hash of aggregation result, write to on-chain via `AggregationAnchor`:

```move
/// On-chain anchor for verifiable aggregation (in intel module)
public struct AggregationAnchor has key {
    id: UID,
    merkle_root: vector<u8>,
    report_count: u64,
    timestamp: u64,
    zoom_level: u8,
}
```

Post-hackathon enhancement: allow users to verify specific cells against the merkle proof.

**SQLite `heatmap_cache` schema:**

```sql
CREATE TABLE heatmap_cache (
    cell_key TEXT PRIMARY KEY,      -- "region:sector_x:sector_y:sector_z:zoom"
    zoom_level INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    sector_x INTEGER NOT NULL,
    sector_y INTEGER NOT NULL,
    sector_z INTEGER NOT NULL,
    total_reports INTEGER NOT NULL,
    reporter_count INTEGER NOT NULL,
    suppressed BOOLEAN NOT NULL DEFAULT 0,
    by_type_json TEXT,              -- JSON: {"0":5,"1":3,...} (Premium)
    avg_severity REAL,              -- (Premium)
    latest_timestamp INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX idx_heatmap_zoom ON heatmap_cache(zoom_level);
CREATE INDEX idx_heatmap_region ON heatmap_cache(region_id, zoom_level);
```

**Future extension point:** `applyDPNoise()` slot in pipeline for differential privacy noise injection.

### 4.3 Data API

```
GET  /api/heatmap/:zoom_level        — Tier-gated heatmap data
GET  /api/intel/:intel_id            — Single intel detail (requires unlock)
GET  /api/region/:region_id/summary  — Region statistics
POST /api/intel/submit               — Submit intel (forwards to on-chain tx)
GET  /api/subscription/status        — Query subscription state
GET  /api/bounties/active            — Active bounty list
```

**Auth:** Wallet-signed JWT → verify → query on-chain SubscriptionNFT → determine tier → filter response.

> **Security note:** Off-chain tier gating is the sole access control for heatmap data. Treat the Data API as a security-critical surface: integration tests must cover tier bypass attempts, rate limit by wallet address (not just IP), and sign heatmap responses with server key for client-side authenticity verification.

**Tier gating:**

| Dimension | Free | Premium |
|-----------|------|---------|
| Latency | 30min delay | Real-time |
| Zoom levels | 0-1 | 0-1-2 |
| Data detail | Count only | Type breakdown + severity |
| Rate limit | 10 req/min | 100 req/min |

**Future:** `/api/plugins/:plugin_id/data` for dApp Store third-party tools, using same auth + tier system.

---

## 5. Client Layer (Frontend)

### 5.1 Tech Stack

- **Framework:** Next.js (App Router) + create-eve-dapp scaffold
- **Wallet:** @mysten/dapp-kit
- **Star Map:** deck.gl (HeatmapLayer, ScatterplotLayer, PathLayer, TextLayer)
- **State:** Zustand (UI state) + TanStack Query (server data) + dapp-kit (on-chain)

### 5.2 Route Structure

| Route | Purpose | Components |
|-------|---------|------------|
| `/map` | Core star map + heatmap (80% usage) | StarMapCanvas, MapControls, IntelPanel |
| `/submit` | Explorer intel submission | SubmitForm, MySubmissions |
| `/bounties` | Bounty board | BountyBoard, CreateBounty |
| `/subscribe` | Subscription management | TierComparison, MySubscription |
| `/store` | Plugin catalog + embedded plugin host | PluginCatalog, PluginDetail, PluginHost, DeveloperPortal |

### 5.3 Key Components

**StarMapCanvas:** deck.gl DeckGL with 4 layers:
- `HeatmapLayer` — aggregated heatmap visualization
- `ScatterplotLayer` — individual intel markers (Premium)
- `PathLayer` — safe route overlays
- `TextLayer` — system/region labels

**MapControls:** Independent component to avoid re-rendering the map:
- ZoomSelector (3 levels)
- FilterPanel (intel type, time range, severity threshold)
- LayerToggle (heat/markers/routes)

**IntelPanel:** Right-side info panel:
- RegionSummary card
- IntelDetail modal (locked/unlocked based on tier + receipts)
- UnlockButton for single-pay

---

## 6. Data Flow

### 6.1 Intel Submission Flow

```
Explorer → /submit UI → intel::submit_intel() → emit IntelSubmittedEvent
    → Event Indexer (WebSocket) → SQLite INSERT → Heatmap Aggregator
    → Spatial bucket recalc → K-anonymity check → heatmap_cache UPDATE
```

Latency: ~2-5s submit to heatmap update (Premium), +30min delay (Free).

### 6.2 Heatmap Consumption Flow

```
User → /map UI → Data API GET /api/heatmap/:zoom
    → JWT verify → on-chain tier check
    → Free: delayed + zoom 0-1 + count only
    → Premium: real-time + all zoom + type breakdown + severity
    → deck.gl HeatmapLayer render
```

### 6.3 Bounty Lifecycle Flow

```
① Requester → CreateBounty → bounty::create_bounty() → SUI locked in escrow
② Explorer sees bounty → goes scouting
③ Explorer → intel::submit_intel() with bounty_id reference
④ Verification: type ∈ wanted? location ∈ region? timestamp ≤ deadline?
⑤ Settlement → bounty::verify_and_release() → escrow → explorer
    → Intel flows into heatmap aggregation
```

Hackathon: mock verification in Explorer Hub contract.
Production: delegates to Bounty_Escrow_Protocol.

### 6.4 Single Intel Unlock Flow

```
User clicks locked intel → IntelPanel UnlockButton
    → access::unlock_intel(intel_id, payment)
    → PricingTable lookup → deduct SUI
    → Mint UnlockReceipt NFT → user
    → Revenue split: reporter gets %
    → emit IntelUnlockedEvent
    → UI re-fetches → shows full data
```

---

## 7. Error Handling & Edge Cases

### 7.1 On-chain

| Scenario | Handling |
|----------|----------|
| Duplicate submit (same reporter, location, type within 10min) | Filtered by off-chain indexer (dedup moved off-chain to avoid shared object contention) |
| Expired subscription accessing Premium data | `verify_access()` falls back to Free tier |
| Bounty past deadline, uncompleted | `refund_expired_bounty()` consumes BountyRequest, returns escrow + storage rebate |
| Sybil fake intel attack (mass wallets flooding region) | `MIN_SUBMIT_DEPOSIT` per submission raises economic cost of attack; K-anonymity filters low-reporter cells; off-chain anomaly detection flags new-account spikes; future: reputation weighting |
| Bounty front-running (copying another reporter's data) | `submit_for_bounty` asserts `intel.reporter == sender` — cannot claim with someone else's IntelReport |
| Admin key compromise | Economic bounds enforced in contract (`MIN/MAX_REPORTER_SHARE_BPS`, `MIN/MAX_PRICE_PER_DAY`); future: multi-sig AdminCap wrapper |
| Unlock price change front-running | `unlock_intel` requires `max_price` slippage parameter |
| Duplicate unlock on same intel | Allowed (effectively a "tip" to reporter — accepted as feature) |
| Unlock receipt for expired intel | Receipt remains valid; UI marks intel as expired |
| Completed/expired BountyRequest objects | `cleanup_completed_bounty` / `refund_expired_bounty` consume and delete the object, reclaiming storage |

### 7.2 Indexer

| Scenario | Handling |
|----------|----------|
| Indexer restart after crash | Resume from last event cursor checkpoint |
| Cache/chain inconsistency | 5min batch recompute + merkle root on-chain anchoring |
| API overload | Rate limit per tier (Free: 10/min, Premium: 100/min) |
| Aggregation hash mismatch | Trigger full recompute, log alert |

### 7.3 Frontend

| Scenario | Handling |
|----------|----------|
| Wallet disconnect | dapp-kit auto-detect, show reconnect prompt |
| Transaction failure | Toast notification + retry button, no auto-retry |
| Large data rendering lag | deck.gl built-in LOD (Level of Detail) |
| Network offline | TanStack Query stale-while-revalidate + offline badge |

---

## 8. Plugin Platform Architecture (dApp Store)

Hub 的平台定位：不只是一個工具，而是讓其他開發者的情報工具能嵌入運行的**宇宙版 App Store**。

### 8.1 Architecture: iframe Sandbox + SDK Injection

**Hackathon 實作：iframe + postMessage（方案 A）**
**未來擴展：Module Federation / micro-frontend（方案 B）**

```
┌─────────────────────────────────────────────────────────┐
│  Frontier Explorer Hub (Host App)                       │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Star Map    │  │ Bounties    │  │ /store      │     │
│  │ (native)    │  │ (native)    │  │ Plugin List │     │
│  └─────────────┘  └─────────────┘  └──────┬──────┘     │
│                                           │             │
│  ┌────────────────────────────────────────▼──────────┐  │
│  │  Plugin Host Container                            │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ <iframe sandbox="...">                       │ │  │
│  │  │   3rd-party Plugin (isolated origin)         │ │  │
│  │  │   ┌──────────────────────────────────┐       │ │  │
│  │  │   │ @explorer-hub/plugin-sdk         │       │ │  │
│  │  │   │ (injected via postMessage)       │       │ │  │
│  │  │   └──────────────────────────────────┘       │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│           ▲ postMessage API ▼                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Plugin Bridge (Host-side)                        │  │
│  │  • Auth proxy (tier verification)                 │  │
│  │  • Data API proxy (rate-limited, scoped)          │  │
│  │  • Wallet action proxy (user approval required)   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Plugin SDK (`@explorer-hub/plugin-sdk`)

第三方開發者引入此 SDK，即可存取 Hub 提供的能力。SDK 透過 `postMessage` 與 Host 通訊，不直接接觸錢包或鏈上資源。

```typescript
// Plugin-side usage (runs inside iframe)
import { ExplorerHubSDK } from '@explorer-hub/plugin-sdk';

const hub = new ExplorerHubSDK();

// 1. 取得用戶資訊與訂閱等級
const user = await hub.getUser();
// { address: '0x...', tier: 'premium', subscriptionExpiry: 1234567890 }

// 2. 查詢熱力圖資料（受用戶 tier 限制）
const heatmap = await hub.getHeatmap({ zoomLevel: 2, regionId: 42 });
// Returns tier-gated data (same rules as native UI)

// 3. 查詢特定情報
const intel = await hub.getIntel(intelId);

// 4. 請求用戶執行鏈上操作（需用戶在 Host 端確認）
const result = await hub.requestTransaction({
  type: 'unlock_intel',
  intelId: '0x...',
  maxPrice: 100_000_000,
});
// Host shows confirmation modal → user approves → tx executed → result returned

// 5. 請求付費解鎖插件自定義內容
const receipt = await hub.requestPayment({
  amount: 50_000_000,
  description: 'Unlock advanced route analysis',
});
// Host handles payment flow, plugin gets receipt
```

**SDK API surface:**

| Method | Description | Requires |
|--------|-------------|----------|
| `getUser()` | 用戶地址、tier、訂閱狀態 | — |
| `getHeatmap(opts)` | 熱力圖資料（tier-gated） | — |
| `getIntel(id)` | 單筆情報（需 unlock） | — |
| `getRegionSummary(regionId)` | 區域統計 | — |
| `getBounties(filter)` | 懸賞列表 | — |
| `requestTransaction(tx)` | 請求鏈上操作 | User approval |
| `requestPayment(opts)` | 請求用戶付費 | User approval |
| `onViewportChange(cb)` | 監聽地圖 viewport 變化 | — |
| `onIntelSelect(cb)` | 監聽用戶選中的情報 | — |

### 8.3 Plugin Bridge (Host-side)

Host 端的 bridge 負責安全代理：

```typescript
// Host-side: PluginBridge.ts
interface PluginBridgeConfig {
  pluginId: string;
  pluginUrl: string;           // iframe src
  permissions: PluginPermission[];  // declared in plugin manifest
  sandboxFlags: string;        // iframe sandbox attribute
}

// Security: all postMessage payloads are validated against plugin's declared permissions
// e.g., a plugin that only declares 'read:heatmap' cannot call requestTransaction()
```

**Security sandbox:**

```html
<iframe
  src="https://plugin.example.com"
  sandbox="allow-scripts allow-forms"
  allow=""
  referrerpolicy="no-referrer"
  csp="default-src 'self'; connect-src https://api.explorer-hub.com"
/>
```

- 無 `allow-same-origin` — 插件不能存取 Host 的 cookie/storage
- 無 `allow-top-navigation` — 插件不能導航 Host 頁面
- CSP 限制 connect-src 只能打 Hub 的 API（不能直接打 RPC）

### 8.4 Plugin Manifest & Registration

每個插件需要一個 manifest 檔：

```json
{
  "id": "route-analyzer-v1",
  "name": "Safe Route Analyzer",
  "version": "1.0.0",
  "author": "0x...",
  "description": "AI-powered safe route calculation between star systems",
  "url": "https://plugin.example.com/route-analyzer",
  "icon": "https://plugin.example.com/icon.png",
  "permissions": [
    "read:heatmap",
    "read:intel",
    "read:viewport",
    "request:payment"
  ],
  "pricing": {
    "model": "per_use",
    "price": 50000000,
    "revenue_split_bps": 8000
  },
  "category": "navigation"
}
```

### 8.5 On-chain: `marketplace` module

```move
/// Plugin registry — shared object
public struct PluginRegistry has key {
    id: UID,
    plugins: Table<ID, PluginListing>,
    platform_fee_bps: u64,         // Hub takes X% of plugin revenue (e.g., 1000 = 10%)
}

public struct PluginListing has store {
    plugin_id: ID,
    developer: address,
    manifest_hash: vector<u8>,     // hash of manifest JSON for integrity
    price_per_use: u64,            // 0 = free plugin
    revenue_split_bps: u64,        // developer's share (rest to Hub treasury)
    active: bool,
    registered_at: u64,
}

public struct PluginUsageReceipt has key, store {
    id: UID,
    user: address,
    plugin_id: ID,
    paid: u64,
    timestamp: u64,
}
```

**Functions:**
- `register_plugin(registry: &mut PluginRegistry, manifest_hash: vector<u8>, price: u64, ...)` — developer registers plugin
- `use_plugin(registry: &PluginRegistry, plugin_id: ID, payment: Coin<SUI>, treasury: &mut SubscriptionConfig)` — user pays for plugin usage; revenue split: developer share transferred, platform fee to treasury. Mint `PluginUsageReceipt`.
- `deactivate_plugin(registry: &mut PluginRegistry, plugin_id: ID, ctx: &TxContext)` — developer deactivates their own plugin
- `remove_plugin(admin: &AdminCap, registry: &mut PluginRegistry, plugin_id: ID)` — admin removes malicious plugin

### 8.6 Revenue Flow

```
User pays for plugin → Coin<SUI> split:
  ├─→ developer_share (revenue_split_bps) → developer address
  └─→ platform_fee (remainder) → SubscriptionConfig.treasury
```

Same treasury as subscription + unlock revenue — unified platform economics.

### 8.7 `/store` Route — Plugin Catalog UI

| Component | Description |
|-----------|-------------|
| `PluginCatalog` | Searchable/filterable grid of available plugins (by category, rating, price) |
| `PluginDetail` | Manifest info, screenshots, install button, usage stats |
| `PluginHost` | iframe container with PluginBridge, sandbox config |
| `PluginPermissionModal` | First-use permission consent (shows declared permissions) |
| `DeveloperPortal` | Plugin registration, manifest upload, revenue dashboard |

### 8.8 Future: Module Federation (方案 B 接口)

Current iframe architecture has a clear upgrade path to Module Federation:

```typescript
// PluginLoader abstraction — swap implementation without changing plugin API
interface PluginLoader {
  load(pluginId: string, config: PluginConfig): Promise<PluginInstance>;
  unload(pluginId: string): void;
}

// Current: IframePluginLoader (sandbox isolation via iframe + postMessage)
// Future:  FederatedPluginLoader (shared React context via Module Federation)
//          Requires plugin audit + approval process before enabling
```

The `ExplorerHubSDK` API surface stays identical for plugin developers — only the transport layer changes (postMessage → direct function calls). Plugins that pass security audit can opt-in to federated mode for better UX.

---

## 9. Other Future Extension Interfaces

Designed but not implemented in Hackathon:

| Interface | Reserved How | Extension Purpose |
|-----------|-------------|-------------------|
| `applyDPNoise()` | Empty function slot in Aggregator pipeline | Differential privacy |
| Walrus adapter | Storage abstraction layer in Data API | Historical snapshots on Walrus |
| Reputation system | `reporter_score` reserved field concept | Anti-fake-intel weighting |
| Module Federation | `PluginLoader` abstraction in Plugin Host | Upgraded plugin embedding (方案 B) |

---

## 10. Testing Strategy

### 9.1 Move Contract Tests (`sui move test`)

| Module | Test Focus |
|--------|-----------|
| `intel` | Submit success, duplicate rejection, expiry cleanup, visibility toggle |
| `subscription` | Mint NFT on payment, expiry check, renewal, upgrade |
| `access` | Access with subscription, rejection without, unlock receipt mint, revenue split math |
| `bounty_interface` | Escrow lock on create, submit verification pass/fail, expired refund |

**Monkey tests:**
- 100 concurrent submits in same block
- Subscription expires mid-unlock transaction
- Bounty reward = 0 or u64::MAX
- GridCell coordinate overflow (sector_x/y/z boundary values)
- Simultaneous unlock attempts on same intel

### 9.2 Indexer Tests

| Level | Approach |
|-------|----------|
| Unit | Bucketing correctness, K-anonymity filtering, time delay calculation |
| Integration | Mock Sui event stream → indexer → verify DB writes + cache updates |
| Monkey | Out-of-order events, duplicate events, 0ms burst, cursor gaps |

### 9.3 API Tests

| Level | Approach |
|-------|----------|
| Unit | Endpoint handler logic with mock DB |
| Integration | JWT flow → API call → tier gating, using testnet subscription |
| Monkey | Invalid JWT, expired JWT, Free accessing Premium endpoint, rate limit edge |

### 9.4 Frontend Tests

| Level | Approach |
|-------|----------|
| Component | Vitest + React Testing Library: MapControls, IntelPanel lock/unlock, TierComparison |
| E2E | Playwright: connect wallet → subscribe → view heatmap → unlock intel → submit intel |
| Monkey | Rapid zoom toggle, rapid unlock clicks, wallet disconnect during operation |
