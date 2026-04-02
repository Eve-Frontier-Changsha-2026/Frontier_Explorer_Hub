# Intel Market v2 — Design Spec

**Date**: 2026-04-01
**Status**: Approved
**Supersedes**: `2026-03-23-intel-market-design.md`

---

## 1. Overview

Intel Market 是 FEH 內的雙模式情報交易市場，整合 Bounty Escrow Protocol 的加密交易概念，但大幅簡化流程。

**雙模式：**
- **賣方模式 (Sell Intel)** — 探索者主動上架加密情報，買家瀏覽 → 購買 → 解密 → 確認 → 放款
- **懸賞模式 (Bounty Board)** — 買家發需求 + 鎖定賞金 → 多個賣家搶單提交 → 買家選一個 → 放款

**與 Bounty Escrow 的差異：**
- 獨立合約，寫在 FEH 的 `frontier_explorer_hub` package，不依賴 Bounty Escrow
- 無 stake、無 dispute、無 arbitrator — 用 reputation 取代流程信任
- 每方 ≤ 2 TX（vs Bounty Escrow 的 7+ TX）

**與現有 `market.move` 的關係：**
- 新模組 `intel_market.move` 與現有 `market.move` 並存，不破壞已有功能
- `market.move` = 簡易即時付款販賣（無 escrow、無評分、無懸賞）
- `intel_market.move` = 完整雙模式市場（escrow + 評分 + 懸賞）
- 未來可 deprecate `market.move`，統一到 `intel_market.move`

**費用模型（v1 簡化版）：**
- Listing fee only（0.01 SUI，成交退還，取消/過期不退）
- 無 platform fee / AdminCap / MarketConfig
- 未來可擴展：加入 platform_fee_bps + treasury（參考現有 `market.move` 的 MarketConfig 模式）
- Seal 加密（與 Bounty Escrow 相同模式）

---

## 2. Move Contract: `intel_market.move`

### 2.1 Structs

```move
/// 公開元資料（所有人可見）
public struct PublicMeta has store, copy, drop {
    region_id: u64,
    sector_x: u64,
    sector_y: u64,
    sector_z: u64,
    intel_type: u8,    // 0=Resource, 1=Threat, 2=Wreckage, 3=Population
    severity: u8,      // 0-10
    expiry: u64,       // absolute timestamp (ms)
}

/// 情報上架單（賣方模式）
public struct IntelListing has key {
    id: UID,
    seller: address,
    title: String,                    // max 256
    public_metadata: PublicMeta,
    encrypted_payload: vector<u8>,    // Seal 加密, max 4096 bytes
    price_mist: u64,
    listing_fee: Balance<SUI>,        // 0.01 SUI, 成交退還, 取消/過期不退
    status: u8,                       // ACTIVE=0, SOLD=1, EXPIRED=2, CANCELLED=3
    payment: Balance<SUI>,            // buyer 付款鎖定
    buyer: Option<address>,
    purchased_at: Option<u64>,        // 觸發 24h auto-release countdown
    created_at: u64,
    is_sealed: bool,                  // encrypted_payload 是否已設定
}

/// 情報懸賞（懸賞模式）
public struct IntelRequest has key {
    id: UID,
    buyer: address,
    title: String,                    // max 256
    intel_type: u8,
    region_id: u64,
    description: String,              // max 1024
    reward: Balance<SUI>,             // 全額鎖定
    deadline: u64,
    status: u8,                       // OPEN=0, REVIEWING=1, COMPLETED=2, CANCELLED=3, EXPIRED=4
    first_submission_at: Option<u64>, // 觸發 24h countdown
    submission_count: u64,
    selected_seller: Option<address>,
    created_at: u64,
}

/// 懸賞提交（DF on IntelRequest）
public struct SubmissionKey has store, copy, drop { seller: address }
public struct IntelSubmission has store {
    seller: address,
    encrypted_payload: vector<u8>,    // Seal namespace = request ID
    submitted_at: u64,
}

/// 賣家信譽（shared object, per address）
public struct SellerProfile has key {
    id: UID,
    seller: address,
    total_trades: u64,
    total_score: u64,                 // 累計分數, avg = total_score / total_trades
    total_weighted_score: u64,        // score × price_mist, 加權平均
    total_volume_mist: u64,           // 累計交易額
    created_at: u64,
}

/// Seal receipts — 兩種分開
public struct ListingViewerReceipt has key {
    id: UID,
    listing_id: ID,
}

public struct RequestViewerReceipt has key {
    id: UID,
    request_id: ID,
}
```

### 2.2 Entry Functions

#### 賣方模式 (Seller 2 TX, Buyer 2 TX)

```
Seller TX1: list_intel(title, public_meta fields, price, fee_coin, clock, ctx)
  → 建立 IntelListing (shared, is_sealed=false)
  → 自動建立 SellerProfile (若不存在，初始 total_trades=0, total_score=0)
  → emit ListingCreatedEvent

Seller TX2: set_encrypted_payload(listing, encrypted_bytes)
  → assert sender == seller && !is_sealed
  → is_sealed = true
  → emit ListingSealedEvent

Buyer TX1: purchase_intel(listing, payment_coin, clock)
  → assert is_sealed && status == ACTIVE
  → payment 鎖入 listing.payment
  → buyer + purchased_at 填入
  → status = SOLD
  → mint ListingViewerReceipt 給 buyer
  → emit IntelPurchasedEvent

Buyer TX2: confirm_and_rate(listing, rating: u8, clock)
  → assert sender == buyer && status == SOLD
  → assert rating >= 1 && rating <= 5
  → payment → seller
  → listing_fee → seller (退還)
  → 更新 SellerProfile:
    total_trades++
    total_score += rating
    total_weighted_score += rating * price_mist
    total_volume_mist += price_mist
  → emit IntelConfirmedEvent { rating }

Permissionless: auto_release(listing, clock)
  → assert status == SOLD
  → assert now > purchased_at + 24h
  → payment → seller
  → listing_fee → seller
  → 更新 SellerProfile (rating = 3 default)
  → emit AutoReleasedEvent
```

#### 懸賞模式 (Buyer 2 TX, Seller 1 TX)

```
Buyer TX1: post_request(title, intel_type, region_id, description, reward_coin, deadline, clock, ctx)
  → 建立 IntelRequest (shared, status=OPEN)
  → emit RequestCreatedEvent

Seller TX1: fulfill_request(request, encrypted_payload, clock)
  → assert status == OPEN || REVIEWING
  → assert now < deadline (if no submissions yet)
  → 新增 IntelSubmission DF (key = SubmissionKey { seller })
  → 若 first submission → first_submission_at = now, status = REVIEWING
  → submission_count++
  → mint RequestViewerReceipt 給 buyer
  → emit SubmissionPostedEvent

Buyer TX2: accept_and_rate(request, seller_addr, rating: u8, clock)
  → assert sender == buyer && status == REVIEWING
  → assert rating >= 1 && rating <= 5
  → reward → selected seller
  → selected_seller = seller_addr
  → status = COMPLETED
  → 更新 SellerProfile
  → emit RequestCompletedEvent { seller_addr, rating }

Permissionless: auto_settle_request(request, clock)
  → assert status == REVIEWING
  → assert now > first_submission_at + 24h
  → reward → first submitter (lowest submitted_at)
  → status = COMPLETED
  → 更新 SellerProfile (rating = 3)
  → emit AutoSettledEvent
```

#### 輔助

```
cancel_listing(listing)
  → assert sender == seller && status == ACTIVE && buyer.is_none()
  → listing_fee 不退 (spam cost)
  → status = CANCELLED

cancel_request(request)
  → assert sender == buyer && submission_count == 0
  → reward 退還 buyer
  → status = CANCELLED

expire_listing(listing, clock)
  → assert now > public_metadata.expiry && status == ACTIVE
  → listing_fee 不退
  → status = EXPIRED

expire_request(request, clock)
  → assert now > deadline && status == OPEN && submission_count == 0
  → reward 退還 buyer
  → status = EXPIRED

seal_approve_listing(listing_id, receipt: &ListingViewerReceipt)
  → assert receipt.listing_id == listing_id
  → Seal key server entry point

seal_approve_request(request_id, receipt: &RequestViewerReceipt)
  → assert receipt.request_id == request_id
  → Seal key server entry point
```

### 2.3 Constants & Error Codes

```move
// Status — Listing
const LISTING_ACTIVE: u8 = 0;
const LISTING_SOLD: u8 = 1;
const LISTING_EXPIRED: u8 = 2;
const LISTING_CANCELLED: u8 = 3;

// Status — Request
const REQUEST_OPEN: u8 = 0;
const REQUEST_REVIEWING: u8 = 1;
const REQUEST_COMPLETED: u8 = 2;
const REQUEST_CANCELLED: u8 = 3;
const REQUEST_EXPIRED: u8 = 4;

// Limits
const MAX_TITLE_LENGTH: u64 = 256;
const MAX_DESCRIPTION_LENGTH: u64 = 1024;
const MAX_ENCRYPTED_PAYLOAD: u64 = 4096;
const MIN_LISTING_FEE: u64 = 10_000_000;     // 0.01 SUI
const AUTO_RELEASE_TIMEOUT: u64 = 86_400_000; // 24h
const MIN_DEADLINE: u64 = 3_600_000;          // 1h
const MAX_DEADLINE: u64 = 604_800_000;        // 7d

// Intel types
const INTEL_RESOURCE: u8 = 0;
const INTEL_THREAT: u8 = 1;
const INTEL_WRECKAGE: u8 = 2;
const INTEL_POPULATION: u8 = 3;

// Rating
const MIN_RATING: u8 = 1;
const MAX_RATING: u8 = 5;
const DEFAULT_RATING: u8 = 3;
```

---

## 3. Frontend Architecture

### 3.1 Routing

- `/submit` → `/intel-market` (rename, add redirect)
- Sidebar nav label: "Intel Market" (icon: exchange/trade icon)

### 3.2 Page Structure

```
/intel-market (page.tsx)
├─ PageHeader (title: "INTEL MARKET", metrics: listings/bounties/rating)
├─ Sub-tabs: [SELL INTEL | BOUNTY BOARD | MY ACTIVITY]
│
├─ SELL INTEL tab
│  ├─ Left (1.6fr): <IntelListingBrowser />
│  │  ├─ SearchBar (keyword, region, type)
│  │  ├─ TypeFilterChips + SortDropdown (newest/price/rating)
│  │  └─ IntelListingCard[] — type, title, meta, seller rating, BUY btn
│  └─ Right (0.95fr, sticky): <NewListingForm />
│     ├─ Title
│     ├─ Public layer (region, sector, type, severity, expiry)
│     ├─ Encrypted layer (exact coords, description)
│     ├─ Price + listing fee
│     └─ "LIST INTEL" button → 2-step TX
│
├─ BOUNTY BOARD tab
│  ├─ Left (1.6fr): <IntelRequestBrowser />
│  │  ├─ SearchBar (keyword, region, type)
│  │  ├─ TypeFilterChips + SortDropdown (reward/newest)
│  │  └─ IntelRequestCard[] — type, title, reward, subs count, countdown, FULFILL btn
│  └─ Right (0.95fr, sticky): <PostRequestForm />
│     ├─ Title, Intel Type, Region ID, Description
│     ├─ Reward + Deadline
│     └─ "POST REQUEST" button → lock reward TX
│
└─ MY ACTIVITY tab (full width)
   ├─ [▾] MY LISTINGS — status filters, action buttons per state
   ├─ [▾] MY PURCHASES — decrypt/confirm flow, rating slider
   ├─ [▾] MY REQUESTS — submission list, decrypt all, select & rate
   └─ [▾] MY SUBMISSIONS — status tracking
```

### 3.3 Hooks

```typescript
// Queries
useIntelListings(filters: { type?, region?, keyword?, sort? })
useIntelRequests(filters: { type?, region?, keyword?, sort? })
useSellerProfile(address: string)
useMyListings(address: string)
useMyPurchases(address: string)
useMyRequests(address: string)
useMySubmissions(address: string)

// Sell mode mutations
useListIntel()              // TX1
useSetEncryptedPayload()    // TX2 (Seal encrypt + submit)
useCancelListing()

// Buy mode mutations
usePurchaseIntel()           // TX1: purchase + ViewerReceipt
useConfirmAndRate()          // TX2: confirm + rate
useAutoRelease()             // permissionless

// Bounty mode mutations
usePostRequest()             // TX1: lock reward
useFulfillRequest()          // TX1: encrypt + submit
useAcceptAndRate()           // TX2: select + rate
useAutoSettle()              // permissionless
useCancelRequest()

// Seal
useSealDecryptListing(listingId: string)
useSealDecryptSubmissions(requestId: string)
```

### 3.4 PTB Builders

File: `lib/ptb/intel-market.ts`

```typescript
buildListIntel(tx, { title, regionId, sectorX, sectorY, sectorZ, intelType, severity, expiry, priceMist, feeCooin, clockId })
buildSetEncryptedPayload(tx, { listingId, encryptedBytes })
buildPurchaseIntel(tx, { listingId, paymentCoin, clockId })
buildConfirmAndRate(tx, { listingId, rating, clockId })
buildAutoRelease(tx, { listingId, clockId })
buildPostRequest(tx, { title, intelType, regionId, description, rewardCoin, deadline, clockId })
buildFulfillRequest(tx, { requestId, encryptedPayload, clockId })
buildAcceptAndRate(tx, { requestId, sellerAddr, rating, clockId })
buildAutoSettle(tx, { requestId, clockId })
buildCancelListing(tx, { listingId })
buildCancelRequest(tx, { requestId })
```

### 3.5 Search

初期實作：前端 client-side filter（從 indexer 拿全量 active items）。

- Title: fuzzy match (includes)
- Region ID: exact match
- Intel type: exact match (filter chips)
- Sort: newest / price (high→low, low→high) / seller rating / reward amount

---

## 4. State Machines

### 4.1 IntelListing

```
list_intel → PENDING_SEAL (is_sealed=false)
  │
  ├─ set_encrypted_payload → ACTIVE (is_sealed=true)
  │     │
  │     ├─ purchase_intel → SOLD
  │     │     │
  │     │     ├─ confirm_and_rate → COMPLETED (有評分)
  │     │     └─ auto_release (24h) → COMPLETED (預設3分)
  │     │
  │     ├─ cancel_listing → CANCELLED (listing_fee不退)
  │     └─ expire_listing → EXPIRED (listing_fee不退)
  │
  └─ cancel_listing → CANCELLED
```

### 4.2 IntelRequest

```
post_request → OPEN
  │
  ├─ fulfill_request (first) → REVIEWING (24h countdown)
  │     │
  │     ├─ accept_and_rate → COMPLETED (buyer 選人)
  │     └─ auto_settle (24h) → COMPLETED (first submitter)
  │
  ├─ cancel_request (0 subs) → CANCELLED (reward退還)
  └─ expire_request (deadline + 0 subs) → EXPIRED (reward退還)
```

### 4.3 Status Colors (FEH palette)

| Status | Color token | Hex |
|--------|------------|-----|
| PENDING_SEAL | `eve.warn` | #d3b075 |
| ACTIVE / OPEN | `eve.safe` | #9fd1b2 |
| SOLD / REVIEWING | `eve.gold` | #e4b480 |
| COMPLETED | `eve.cold` | #9db6d8 |
| CANCELLED | `eve.muted` | rgba(231,237,248,0.62) |
| EXPIRED | `eve.danger` | #db7768 |

### 4.4 Countdown Display

- `> 12h`: "Xh left"
- `1-12h`: "Xh Xm left", color `eve.warn`
- `< 1h`: "Xm left", color `eve.danger` + `animate-pulse-dot`
- Expired: "AUTO-RELEASE" / "AUTO-SETTLE" button

---

## 5. Seal Integration

### 5.1 Encryption Namespaces

- Listing: namespace = `listing.id` bytes
- Request: namespace = `request.id` bytes

### 5.2 Sell Mode Flow

```
Seller:
  TX1 → list_intel → get listing_id
  Client: sealEncrypt(listing_id, plaintext) → encrypted_bytes
  TX2 → set_encrypted_payload(listing_id, encrypted_bytes)

Buyer:
  TX1 → purchase_intel → ListingViewerReceipt minted
  Client: create SessionKey → wallet sign personal message
          → build seal_approve_listing TX (dry-run)
          → SealClient.decrypt(encrypted_payload, sessionKey, txBytes)
          → plaintext revealed
  TX2 → confirm_and_rate(listing_id, rating)
```

### 5.3 Bounty Mode Flow

```
Buyer:
  TX1 → post_request → get request_id

Seller:
  Client: sealEncrypt(request_id, plaintext) → encrypted_bytes
  TX1 → fulfill_request(request_id, encrypted_bytes)
         → RequestViewerReceipt minted to buyer

Buyer:
  Client: decrypt each submission via Seal
  TX2 → accept_and_rate(request_id, seller_addr, rating)
```

---

## 6. Reputation System

### 6.1 Scoring

- New seller: `total_trades=0, total_score=0`; 前端顯示 `total_trades == 0 ? 3.0 : total_score / total_trades`
- Each trade: buyer rates 1-5 (default 3 if auto-release/auto-settle)
- Simple average: `total_score / total_trades`
- Weighted average: `total_weighted_score / total_volume_mist` (higher value trades weigh more)

### 6.2 Display

- Listing cards: `★ 4.2 (23 trades)`
- Front-end shows both simple average and trade count
- Weighted average available for advanced filtering

### 6.3 Anti-Gaming

- Only actual paying buyers can rate (enforced on-chain)
- Weighted average makes self-buying with tiny amounts less effective
- Volume displayed alongside rating for transparency

---

## 7. File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `move/sources/intel_market.move` | Core contract |
| `app/src/app/intel-market/page.tsx` | Main page |
| `app/src/components/intel-market/IntelListingBrowser.tsx` | Sell tab left panel |
| `app/src/components/intel-market/IntelListingCard.tsx` | Listing card |
| `app/src/components/intel-market/NewListingForm.tsx` | Sell tab right panel |
| `app/src/components/intel-market/IntelRequestBrowser.tsx` | Bounty tab left panel |
| `app/src/components/intel-market/IntelRequestCard.tsx` | Request card |
| `app/src/components/intel-market/PostRequestForm.tsx` | Bounty tab right panel |
| `app/src/components/intel-market/MyActivity.tsx` | Activity tab |
| `app/src/components/intel-market/RatingStars.tsx` | 1-5 rating component |
| `app/src/components/intel-market/CountdownTimer.tsx` | Countdown display |
| `app/src/hooks/use-intel-market.ts` | All hooks |
| `app/src/lib/ptb/intel-market.ts` | PTB builders |

### Modified Files

| File | Change |
|------|--------|
| `app/src/components/Sidebar.tsx` | Rename "Submit Intel" → "Intel Market", path → `/intel-market` |
| `app/src/lib/constants.ts` | Add intel market constants |
| `app/src/types/index.ts` | Add IntelListing, IntelRequest, SellerProfile types |
| `move/Move.toml` | No change (same package) |

### Removed

| File | Reason |
|------|--------|
| `app/src/app/submit/page.tsx` | Replaced by `/intel-market` |
