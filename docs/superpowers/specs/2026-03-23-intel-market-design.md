# Intel Market — Design Spec

**Date**: 2026-03-23
**Status**: Draft
**Author**: AI-assisted design, user-approved sections

---

## 1. Overview

Intel Market 是一個去中心化的情報交易市場，讓玩家可以自由定價販賣鏈上情報。與 Bounty（懸賞）系統互補：

| | Bounty（懸賞） | Intel Market（販賣） |
|---|---|---|
| 發起方 | 買家出懸賞 | 賣家掛單 |
| 驗證 | Verifier + proof/dispute 流程 | 無驗證，買家自負風險 |
| 信任來源 | 流程保障 | 賣家信譽分數 |
| 結算 | Escrow 多階段 | 一手交錢一手交貨 |
| 加密 | 無 | Sui Seal 加密 |

**核心特性**：
- 定價掛單（賣家設價格 + 限量份數）
- Sui Seal 加密（付費才能解密詳細情報）
- Off-chain 信譽系統（公會、存活時間、鏈上活躍度）
- 預留訂閱制(B)、拍賣制(C) 接口

---

## 2. Module Architecture

```
market.move ──depends──▶ intel.move (讀 IntelReport)
market.move ──depends──▶ admin.move (MarketConfig 初始化需 AdminCap)
market.move    獨立於    access.move (各自的定價/分潤)
market.move    獨立於    bounty.move (完全不同的交易模式)
```

**物件關係**：
```
IntelReport (shared, intel.move)
     │
     ├──referenced by──▶ IntelListing (shared, market.move)
     │                        │
     │                        └──purchase──▶ MarketReceipt (owned, buyer)
     │                                           │
     │                                           └──Seal verify──▶ 解密 payload
     │
     ├──referenced by──▶ BountyRequest (shared, bounty.move)  ← 現有
     └──unlocked by───▶ UnlockReceipt (owned, access.move)   ← 現有
```

一份 IntelReport 可以同時被平台 unlock、掛到 market 賣、提交到 bounty。三條路互不衝突。

---

## 3. Data Structures

```move
module frontier_explorer_hub::market {

    /// 情報掛單（shared object）
    public struct IntelListing has key {
        id: UID,
        seller: address,
        intel_id: ID,
        intel_type: u8,            // 冗餘，方便 indexer filter
        region_id: u64,            // 冗餘，方便 indexer filter
        listing_type: u8,          // 0 = fixed price（預留 1=subscription, 2=auction）
        price: u64,                // 單份價格 (MIST)
        max_buyers: u64,           // 限量份數
        sold_count: u64,           // 已售出
        encrypted_payload: vector<u8>,  // Seal 加密的詳細情報
        expiry: u64,               // 掛單到期 timestamp_ms
        created_at: u64,
        active: bool,
        buyers: VecSet<address>,   // 重複購買防護
    }

    /// 購買憑證（buyer owned, Seal policy 驗證用）
    public struct MarketReceipt has key, store {
        id: UID,
        buyer: address,
        listing_id: ID,
        intel_id: ID,
        purchased_at: u64,
        price_paid: u64,
    }

    /// 市場設定（shared, admin 管理）
    public struct MarketConfig has key {
        id: UID,
        platform_fee_bps: u64,    // 平台抽成 (basis points)
        min_price: u64,            // 最低掛單價
        max_buyers_cap: u64,       // 單筆最大限量
        treasury: Balance<SUI>,    // 平台手續費 treasury（獨立於 subscription treasury，方便分別統計 market 收入）
    }
}
```

**設計考量**：
- `intel_type` / `region_id` 冗餘：indexer 不用 join IntelReport 就能 filter
- `listing_type: u8`：目前固定 `0`（定價），預留未來訂閱/拍賣擴展，避免 migration
- `MarketReceipt` 有 `key, store`：允許 transfer，Seal policy 需要用 object reference
- `buyers: VecSet<address>`：max 100 人，語義比 `VecMap<address, bool>` 更清晰
- `IntelListing` 只有 `key`（無 `store`）：不需要被 wrap/transfer
- `encrypted_payload` 上限 4KB：足夠文字情報，防止濫用
- `treasury` 獨立於 `SubscriptionConfig.treasury`：刻意分開，方便分別追蹤 market vs subscription 收入，admin 需從兩個 treasury 分別提取

---

## 4. Constants & Error Codes

```move
// ── Size limits ──
const MAX_PAYLOAD_SIZE: u64 = 4096;        // 4KB
const MAX_BUYERS_CAP: u64 = 100;
const MAX_PLATFORM_FEE_BPS: u64 = 5000;   // 50% 上限
const LISTING_TYPE_FIXED: u8 = 0;

// ── Default config values ──
const DEFAULT_PLATFORM_FEE_BPS: u64 = 250;     // 2.5%
const DEFAULT_MIN_PRICE: u64 = 10_000_000;      // 0.01 SUI
const DEFAULT_MAX_BUYERS_CAP: u64 = 100;

// ── Error codes (200 series, avoid collision with other modules) ──
const ENotReporter: u64 = 200;             // seller != intel.reporter
const EIntelExpired: u64 = 201;
const EPayloadTooLarge: u64 = 202;
const EListingNotActive: u64 = 203;
const ESoldOut: u64 = 204;
const EInsufficientPayment: u64 = 205;
const ENotSeller: u64 = 206;
const EHasBuyers: u64 = 207;
const EPriceTooLow: u64 = 208;
const EMaxBuyersExceeded: u64 = 209;
const EListingNotExpired: u64 = 210;
const EAlreadyPurchased: u64 = 211;
const ESelfPurchase: u64 = 212;            // seller 不能自購
const EListingExpiryInPast: u64 = 213;     // 掛單到期時間已過
const EFeeTooHigh: u64 = 214;              // platform fee > MAX
const EInvalidSealId: u64 = 215;           // Seal namespace 不匹配
```

---

## 5. Core Functions

### 5.1 list_intel — 賣家掛單

```move
entry fun list_intel(
    intel: &IntelReport,
    price: u64,
    max_buyers: u64,
    expiry: u64,
    encrypted_payload: vector<u8>,
    config: &MarketConfig,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

**Preconditions**:
- `ctx.sender() == intel.reporter()` → ENotReporter
- `clock.timestamp_ms() < intel.expiry()` → EIntelExpired
- `expiry > clock.timestamp_ms()` → EListingExpiryInPast
- `encrypted_payload.length() <= MAX_PAYLOAD_SIZE` → EPayloadTooLarge
- `price >= config.min_price` → EPriceTooLow
- `max_buyers <= config.max_buyers_cap` → EMaxBuyersExceeded

**Notes**:
- `region_id` 取自 `intel::region_id(&intel::location(intel))`
- `intel_type` 取自 `intel::intel_type(intel)`
- `listing_type` 固定 `LISTING_TYPE_FIXED (0)`

**Effects**: 建立 `IntelListing` shared object, emit `ListingCreatedEvent`

### 5.2 purchase_intel — 買家購買

```move
entry fun purchase_intel(
    listing: &mut IntelListing,
    payment: &mut Coin<SUI>,
    config: &mut MarketConfig,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

**Preconditions**:
- `listing.active` → EListingNotActive
- `clock.timestamp_ms() < listing.expiry` → EListingNotActive
- `listing.sold_count < listing.max_buyers` → ESoldOut
- `ctx.sender() != listing.seller` → ESelfPurchase
- `!listing.buyers.contains(&ctx.sender())` → EAlreadyPurchased
- `payment.value() >= listing.price` → EInsufficientPayment

**Effects**:
1. Split `listing.price` from payment
2. Calculate: `platform_fee = price * config.platform_fee_bps / 10000`
3. `seller_share = price - platform_fee`
4. Transfer `seller_share` to `listing.seller`
5. Deposit `platform_fee` to `config.treasury`
6. `listing.sold_count += 1`
7. `listing.buyers.insert(ctx.sender())`
8. Mint `MarketReceipt` → transfer to buyer
9. Emit `IntelPurchasedEvent`

### 5.3 delist_intel — 賣家下架

```move
entry fun delist_intel(
    listing: &mut IntelListing,
    ctx: &TxContext,
)
```

**Preconditions**: `ctx.sender() == listing.seller` → ENotSeller

**Effects**: `listing.active = false`, emit `ListingDelistedEvent`. 已購買的 receipt 不受影響（Seal 解密仍有效）。

### 5.4 expire_listing — 過期清理

```move
entry fun expire_listing(
    listing: &mut IntelListing,
    clock: &Clock,
)
```

**Preconditions**: `clock.timestamp_ms() >= listing.expiry` → EListingNotExpired

**Effects**: `listing.active = false`, emit `ListingExpiredEvent`. 無權限限制，任何人可 call。

### 5.5 update_price — 更新價格

```move
entry fun update_price(
    listing: &mut IntelListing,
    new_price: u64,
    config: &MarketConfig,
    ctx: &TxContext,
)
```

**Preconditions**:
- `ctx.sender() == listing.seller` → ENotSeller
- `listing.active` → EListingNotActive
- `listing.sold_count == 0` → EHasBuyers
- `new_price >= config.min_price` → EPriceTooLow

**Effects**: Update price, emit `PriceUpdatedEvent`

### 5.6 Admin Functions

```move
/// 建立 MarketConfig (init 時呼叫)
/// 使用 DEFAULT_PLATFORM_FEE_BPS (250 = 2.5%), DEFAULT_MIN_PRICE (0.01 SUI), DEFAULT_MAX_BUYERS_CAP (100)
public fun create_market_config(_admin: &AdminCap, ctx: &mut TxContext)

/// 更新平台抽成
/// Precondition: fee_bps <= MAX_PLATFORM_FEE_BPS (5000 = 50%) → EFeeTooHigh
public fun set_platform_fee(_admin: &AdminCap, config: &mut MarketConfig, fee_bps: u64)

/// 更新最低價格
public fun set_min_price(_admin: &AdminCap, config: &mut MarketConfig, min_price: u64)

/// 提取 treasury → returns Coin<SUI>（與 subscription::withdraw_treasury 模式一致）
public fun withdraw_treasury(_admin: &AdminCap, config: &mut MarketConfig, amount: u64, ctx: &mut TxContext): Coin<SUI>
```

**Note**: `delist` 和 `expire_listing` 都 take `&mut IntelListing`。SUI shared object 保證同一物件的 mutation 會序列化，因此不存在 race condition（例如 delist 和 purchase 同時發生）。

---

## 6. Event System

```move
struct ListingCreatedEvent has copy, drop {
    listing_id: ID,
    seller: address,
    intel_id: ID,
    intel_type: u8,
    region_id: u64,
    price: u64,
    max_buyers: u64,
    expiry: u64,
}

struct IntelPurchasedEvent has copy, drop {
    listing_id: ID,
    buyer: address,
    intel_id: ID,
    price_paid: u64,
    seller_share: u64,
    platform_fee: u64,
    sold_count: u64,        // 購買後的 count，判斷售罄
}

struct ListingDelistedEvent has copy, drop {
    listing_id: ID,
    seller: address,
    sold_count: u64,
}

struct ListingExpiredEvent has copy, drop {
    listing_id: ID,
    sold_count: u64,
}

struct PriceUpdatedEvent has copy, drop {
    listing_id: ID,
    old_price: u64,
    new_price: u64,
}
```

**設計原則**（from lessons learned）: Event 不含所有 object fields。Indexer 需要完整資料時用 `getObject()` 補查。`sold_count` 放進 event 是為了讓 indexer 直接判斷售罄狀態。

---

## 7. Seal Integration

### 7.1 Seal 概念

Sui Seal 是去中心化密鑰管理（DSM）框架。核心模式：
- `seal_approve(id: vector<u8>, ...)` — 第一個參數永遠是 `id`（identity bytes）
- `id` 的前綴必須是 policy object 的 ID bytes（namespace 驗證）
- 加密時：`id = [policyObjectBytes + nonce]`
- 解密時：Seal key server dry-run `seal_approve`，通過才提供解密能力

### 7.2 Policy Object 選擇

**問題**: 用什麼做 Seal 的 namespace（policy object）？

| 方案 | namespace | 優缺點 |
|------|-----------|--------|
| IntelListing ID | listing_id | ❌ listing_id 在 `list_intel()` 執行前未知（雞蛋問題） |
| IntelReport ID | intel_id | ⚠️ 同一 intel 多次掛單共享解密——可接受，因為情報內容相同 |
| MarketConfig ID | config_id | ❌ 所有 listing 共用一個 namespace，無隔離 |

**決策**: 使用 `intel_id` 作為 namespace。

**已知限制**: 同一 `IntelReport` 的所有 listing 買家都能解密同一 payload。這在實務上可接受——同一份情報的內容本就相同。未來若需要 per-listing 隔離，可改為兩步驟（先建 listing 拿到 ID，再加密 payload）。

### 7.3 Policy Function

```move
/// Seal key server 呼叫的 approve function
/// 遵循 Seal 標準簽名: id 為第一參數
entry fun seal_approve(
    id: vector<u8>,
    receipt: &MarketReceipt,
) {
    // 1. 驗證 namespace: id 前綴必須是 receipt.intel_id 的 bytes
    let namespace = object::id_to_bytes(&receipt.intel_id);
    assert!(id.length() >= namespace.length(), EInvalidSealId);
    let mut i = 0;
    while (i < namespace.length()) {
        assert!(namespace[i] == id[i], EInvalidSealId);
        i = i + 1;
    };
    // 通過 → Seal server 允許解密
    // 失敗 → abort, 無法解密
}
```

### 7.4 加密流程 (前端)

```typescript
import { SealClient } from '@mysten/seal';
import { fromHex, toHex } from '@mysten/sui/utils';

// 掛單時: 賣家加密情報
async function encryptIntelPayload(
  sealClient: SealClient,
  packageId: string,
  intelId: string,        // IntelReport 的 object ID
  plaintext: string,       // 精確座標 + 詳細描述
) {
  // 1. 用 intel_id 作為 namespace + random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(5));
  const intelIdBytes = fromHex(intelId);
  const id = toHex(new Uint8Array([...intelIdBytes, ...nonce]));

  // 2. Seal 加密
  const data = new TextEncoder().encode(plaintext);
  const { encryptedObject, key: backupKey } = await sealClient.encrypt({
    threshold: 2,
    packageId,
    id,
    data,
  });

  // 3. encryptedObject 傳入 list_intel() 的 encrypted_payload 參數
  return { encryptedPayload: encryptedObject, backupKey };
}
```

### 7.5 解密流程 (前端)

```typescript
// 購買後: 買家解密情報
async function decryptIntelPayload(
  sealClient: SealClient,
  suiClient: SuiClient,
  sessionKey: SessionKey,
  packageId: string,
  receiptId: string,       // MarketReceipt object ID
  encryptedBytes: Uint8Array,
) {
  // 1. 構造 seal_approve 交易（dry-run 用）
  const tx = new Transaction();
  const encryptedObject = EncryptedObject.parse(encryptedBytes);
  tx.moveCall({
    target: `${packageId}::market::seal_approve`,
    arguments: [
      tx.pure.vector("u8", fromHex(encryptedObject.id)),
      tx.object(receiptId),
    ],
  });

  // 2. Build tx bytes (不上鏈，只用於 Seal server 驗證)
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  // 3. 解密
  const decryptedBytes = await sealClient.decrypt({
    data: encryptedBytes,
    sessionKey,
    txBytes,
  });

  return new TextDecoder().decode(decryptedBytes);
}
```

### 7.6 Seal 依賴

- 前端: `@mysten/seal` SDK
- 鏈上: 無額外 package 依賴（`seal_approve` 是純 Move 邏輯，不引用 Seal framework）
- Key server: 使用 Sui 官方 Seal key server（testnet 可用）

---

## 8. Frontend Integration

### 8.1 PTB Builders (`lib/ptb/market.ts`)

```typescript
buildListIntel(tx, intelId, price, maxBuyers, expiry, encryptedPayload)
buildPurchaseIntel(tx, listingId, price)
buildDelistIntel(tx, listingId)
buildExpireListing(tx, listingId)
buildUpdatePrice(tx, listingId, newPrice)
```

### 8.2 Hook (`hooks/use-market.ts`)

```typescript
useMarket() → {
  listings: IntelListing[],
  isLoading: boolean,
  listIntel: (params) => result,
  purchaseIntel: (listingId) => result,
  delistIntel: (listingId) => result,
  updatePrice: (listingId, newPrice) => result,
  isListing: boolean,
  isPurchasing: boolean,
}
```

### 8.3 API Endpoints (Indexer)

```
GET /market/listings?region=&type=&sort=price    ← active listings
GET /market/listings/:id                          ← listing detail + seller 信譽
GET /market/purchases?buyer=                      ← 我的購買記錄
GET /market/sales?seller=                         ← 我的銷售記錄
GET /reputation/:address                          ← 賣家信譽分
```

### 8.4 Types (`types/index.ts`)

```typescript
interface IntelListing {
  id: string;
  seller: string;
  intelId: string;
  intelType: number;
  regionId: number;
  price: number;
  maxBuyers: number;
  soldCount: number;
  expiry: number;
  active: boolean;
}

interface MarketReceipt {
  id: string;
  buyer: string;
  listingId: string;
  intelId: string;
  purchasedAt: number;
  pricePaid: number;
}

interface SellerReputation {
  address: string;
  score: number;           // 0-100
  totalSales: number;
  repeatBuyerRate: number;
  guildName?: string;
  survivalDays?: number;
  onChainAge: number;
}
```

### 8.5 Page

`/store` 頁新增 "Intel Market" tab，或獨立 `/market` 頁。

---

## 9. Reputation System (Off-chain)

### 9.1 Data Sources

**鏈上指標** (from indexer):
- 總銷售數 (`IntelPurchasedEvent` count)
- 重複購買率（同一買家買同一賣家多次 = 高信任）
- 上架數 vs 實際售出比例
- 帳號年齡（first tx timestamp）

**EVE EYES API** (`eve-eyes.d0v.xyz`):
- 公會名稱 / 等級
- 存活天數 / 被擊殺次數
- 活躍度分數

### 9.2 Scoring

```
reputation_score = weighted_average(
  chain_sales_score      * 0.3,
  repeat_buyer_rate      * 0.2,
  sell_through_rate      * 0.1,
  account_age_score      * 0.1,
  guild_score            * 0.15,
  survival_score         * 0.15,
)
```

→ 存 DB，前端 API 取用，不上鏈（零 gas）。

### 9.3 Display

前端掛單旁顯示：信譽分 badge + 各維度指標 tooltip。買家自行判斷。

---

## 10. Security Considerations

- **seller == reporter**: `list_intel()` 驗證 `ctx.sender() == intel.reporter()`，防止冒賣
- **Self-purchase blocked**: `purchase_intel()` 驗證 `ctx.sender() != listing.seller`，防止刷量灌水信譽
- **重複購買**: `VecSet<address>` 防止同一地址重複購買
- **Payload size**: 限制 4KB 防止鏈上垃圾
- **Price manipulation**: `sold_count > 0` 後不可改價，保護已觀望中的買家
- **Listing expiry validation**: `list_intel()` 驗證 `expiry > now`，防止建立已過期的 listing
- **Platform fee cap**: `set_platform_fee()` 限制 `fee_bps <= 5000 (50%)`，防止 admin 設 100% 抽成
- **Seal security**: 加密 payload 只有持有 `MarketReceipt` 且 `intel_id` namespace 匹配才能解密，seller 無需在線
- **Shared object concurrency**: `IntelListing` 的所有 mutation（purchase, delist, expire）都 take `&mut`，SUI 保證序列化，無 race condition

---

## 11. Accessor Functions

```move
// ── IntelListing accessors ──
public fun seller(listing: &IntelListing): address
public fun intel_id(listing: &IntelListing): ID
public fun intel_type(listing: &IntelListing): u8
public fun region_id(listing: &IntelListing): u64
public fun listing_type(listing: &IntelListing): u8
public fun price(listing: &IntelListing): u64
public fun max_buyers(listing: &IntelListing): u64
public fun sold_count(listing: &IntelListing): u64
public fun expiry(listing: &IntelListing): u64
public fun is_active(listing: &IntelListing): bool
public fun is_sold_out(listing: &IntelListing): bool  // sold_count >= max_buyers

// ── MarketReceipt accessors ──
public fun receipt_buyer(receipt: &MarketReceipt): address
public fun receipt_listing_id(receipt: &MarketReceipt): ID
public fun receipt_intel_id(receipt: &MarketReceipt): ID
public fun receipt_price_paid(receipt: &MarketReceipt): u64

// ── MarketConfig accessors ──
public fun platform_fee_bps(config: &MarketConfig): u64
public fun min_price(config: &MarketConfig): u64
public fun treasury_value(config: &MarketConfig): u64
```

---

## 12. Test Helpers

```move
#[test_only]
public fun create_listing_for_testing(...) → IntelListing
#[test_only]
public fun destroy_listing_for_testing(listing: IntelListing)
#[test_only]
public fun create_receipt_for_testing(...) → MarketReceipt
#[test_only]
public fun destroy_receipt_for_testing(receipt: MarketReceipt)
#[test_only]
public fun create_market_config_for_testing(ctx: &mut TxContext) → MarketConfig
#[test_only]
public fun destroy_market_config_for_testing(config: MarketConfig)
```

---

## 13. Scope Boundary

**本 spec 涵蓋**: market.move 合約 + Seal policy + 前端整合層設計 + 信譽系統設計
**不涵蓋**: Bounty proof/dispute 前端整合（已有獨立 spec）、Indexer 實作細節、訂閱制/拍賣制
**預留接口**: `listing_type: u8` 已內建，未來可擴展 `1 = subscription`, `2 = auction`
