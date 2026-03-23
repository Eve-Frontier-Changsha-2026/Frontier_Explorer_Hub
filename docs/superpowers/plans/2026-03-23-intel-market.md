# Intel Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a decentralized intel marketplace where sellers list Seal-encrypted intel at fixed prices and buyers purchase to decrypt.

**Architecture:** New `market.move` module (independent from `access.move` and `bounty.move`), Sui Seal encryption for payload access control, off-chain reputation system via indexer + EVE EYES API. Frontend: PTB builders + React hook + API endpoints + types.

**Tech Stack:** Sui Move 2024 edition, Sui Seal (`@mysten/seal`), React + TanStack Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-intel-market-design.md`

---

## File Map

### Move (Create)
| File | Responsibility |
|------|---------------|
| `move/frontier_explorer_hub/sources/market.move` | Intel Market module — structs, core functions, Seal policy, admin, accessors, test helpers |
| `move/frontier_explorer_hub/sources/tests/market_tests.move` | Unit tests for market module |

### Move (Modify)
| File | Change |
|------|--------|
| `move/frontier_explorer_hub/sources/admin.move` | Add market default constants + accessors (lines ~60-70, ~130-140) |

### Frontend (Create)
| File | Responsibility |
|------|---------------|
| `next-monorepo/app/src/lib/ptb/market.ts` | PTB builders for market operations |
| `next-monorepo/app/src/hooks/use-market.ts` | React hook for market queries + mutations |
| `next-monorepo/app/src/__tests__/ptb/market.test.ts` | PTB builder unit tests |
| `next-monorepo/app/src/__tests__/hooks/use-market.test.ts` | Hook unit tests |

### Frontend (Modify)
| File | Change |
|------|--------|
| `next-monorepo/app/src/types/index.ts` | Add IntelListing, MarketReceipt, SellerReputation interfaces |
| `next-monorepo/app/src/lib/constants.ts` | Add marketConfig shared object ID |
| `next-monorepo/app/src/lib/api-client.ts` | Add market API endpoints |

---

## Task 1: Add Market Default Constants to admin.move

**Files:**
- Modify: `move/frontier_explorer_hub/sources/admin.move:55-70` (constants), `:130-140` (accessors)

- [ ] **Step 1: Add market constants after line 69 (MAX_BATCH_SIZE)**

```move
// ── Market defaults ──
const DEFAULT_MARKET_FEE_BPS: u64 = 250;          // 2.5% platform fee
const DEFAULT_MARKET_MIN_PRICE: u64 = 10_000_000;  // 0.01 SUI
const DEFAULT_MARKET_MAX_BUYERS: u64 = 100;
const MAX_MARKET_FEE_BPS: u64 = 5000;              // 50% ceiling
const MAX_MARKET_PAYLOAD_SIZE: u64 = 4096;          // 4KB
```

- [ ] **Step 2: Add accessor functions after line 142 (max_batch_size)**

```move
// ── Market accessors ──
public fun default_market_fee_bps(): u64 { DEFAULT_MARKET_FEE_BPS }
public fun default_market_min_price(): u64 { DEFAULT_MARKET_MIN_PRICE }
public fun default_market_max_buyers(): u64 { DEFAULT_MARKET_MAX_BUYERS }
public fun max_market_fee_bps(): u64 { MAX_MARKET_FEE_BPS }
public fun max_market_payload_size(): u64 { MAX_MARKET_PAYLOAD_SIZE }
```

- [ ] **Step 3: Build to verify no errors**

Run: `cd move/frontier_explorer_hub && sui move build`
Expected: `BUILDING frontier_explorer_hub` with no errors

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `cd move/frontier_explorer_hub && sui move test`
Expected: all 57 tests pass

- [ ] **Step 5: Commit**

```bash
git add move/frontier_explorer_hub/sources/admin.move
git commit -m "feat(admin): add market default constants and accessors"
```

---

## Task 2: Create market.move — Structs + Constants + Accessors + Test Helpers

**Files:**
- Create: `move/frontier_explorer_hub/sources/market.move`

- [ ] **Step 1: Write market.move with structs, constants, events, accessors, test helpers**

```move
module frontier_explorer_hub::market {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;
    use sui::vec_set::{Self, VecSet};

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;

    // ═══════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════

    const LISTING_TYPE_FIXED: u8 = 0;

    // ═══════════════════════════════════════════════
    // Error codes (200 series)
    // ═══════════════════════════════════════════════

    const ENotReporter: u64 = 200;
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
    const ESelfPurchase: u64 = 212;
    const EListingExpiryInPast: u64 = 213;
    const EFeeTooHigh: u64 = 214;
    const EInvalidSealId: u64 = 215;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct IntelListing has key {
        id: UID,
        seller: address,
        intel_id: ID,
        intel_type: u8,
        region_id: u64,
        listing_type: u8,
        price: u64,
        max_buyers: u64,
        sold_count: u64,
        encrypted_payload: vector<u8>,
        expiry: u64,
        created_at: u64,
        active: bool,
        buyers: VecSet<address>,
    }

    public struct MarketReceipt has key, store {
        id: UID,
        buyer: address,
        listing_id: ID,
        intel_id: ID,
        purchased_at: u64,
        price_paid: u64,
    }

    public struct MarketConfig has key {
        id: UID,
        platform_fee_bps: u64,
        min_price: u64,
        max_buyers_cap: u64,
        treasury: Balance<SUI>,
    }

    // ═══════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════

    public struct ListingCreatedEvent has copy, drop {
        listing_id: ID,
        seller: address,
        intel_id: ID,
        intel_type: u8,
        region_id: u64,
        price: u64,
        max_buyers: u64,
        expiry: u64,
    }

    public struct IntelPurchasedEvent has copy, drop {
        listing_id: ID,
        buyer: address,
        intel_id: ID,
        price_paid: u64,
        seller_share: u64,
        platform_fee: u64,
        sold_count: u64,
    }

    public struct ListingDelistedEvent has copy, drop {
        listing_id: ID,
        seller: address,
        sold_count: u64,
    }

    public struct ListingExpiredEvent has copy, drop {
        listing_id: ID,
        sold_count: u64,
    }

    public struct PriceUpdatedEvent has copy, drop {
        listing_id: ID,
        old_price: u64,
        new_price: u64,
    }

    // ═══════════════════════════════════════════════
    // Admin functions
    // ═══════════════════════════════════════════════

    public fun create_market_config(
        _admin: &admin::AdminCap,
        ctx: &mut TxContext,
    ) {
        let config = MarketConfig {
            id: object::new(ctx),
            platform_fee_bps: admin::default_market_fee_bps(),
            min_price: admin::default_market_min_price(),
            max_buyers_cap: admin::default_market_max_buyers(),
            treasury: balance::zero(),
        };
        transfer::share_object(config);
    }

    public fun set_platform_fee(
        _admin: &admin::AdminCap,
        config: &mut MarketConfig,
        fee_bps: u64,
    ) {
        assert!(fee_bps <= admin::max_market_fee_bps(), EFeeTooHigh);
        config.platform_fee_bps = fee_bps;
    }

    public fun set_min_price(
        _admin: &admin::AdminCap,
        config: &mut MarketConfig,
        min_price: u64,
    ) {
        config.min_price = min_price;
    }

    public fun withdraw_treasury(
        _admin: &admin::AdminCap,
        config: &mut MarketConfig,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        let withdrawn = config.treasury.split(amount);
        coin::from_balance(withdrawn, ctx)
    }

    // ═══════════════════════════════════════════════
    // Core functions — placeholder (Task 3)
    // ═══════════════════════════════════════════════

    // list_intel, purchase_intel, delist_intel, expire_listing, update_price
    // will be added in Task 3

    // ═══════════════════════════════════════════════
    // Seal policy — placeholder (Task 4)
    // ═══════════════════════════════════════════════

    // seal_approve will be added in Task 4

    // ═══════════════════════════════════════════════
    // Accessor functions
    // ═══════════════════════════════════════════════

    // ── IntelListing ──
    public fun seller(listing: &IntelListing): address { listing.seller }
    public fun intel_id(listing: &IntelListing): ID { listing.intel_id }
    public fun listing_intel_type(listing: &IntelListing): u8 { listing.intel_type }
    public fun listing_region_id(listing: &IntelListing): u64 { listing.region_id }
    public fun listing_type(listing: &IntelListing): u8 { listing.listing_type }
    public fun price(listing: &IntelListing): u64 { listing.price }
    public fun max_buyers(listing: &IntelListing): u64 { listing.max_buyers }
    public fun sold_count(listing: &IntelListing): u64 { listing.sold_count }
    public fun expiry(listing: &IntelListing): u64 { listing.expiry }
    public fun is_active(listing: &IntelListing): bool { listing.active }
    public fun is_sold_out(listing: &IntelListing): bool { listing.sold_count >= listing.max_buyers }

    // ── MarketReceipt ──
    public fun receipt_buyer(receipt: &MarketReceipt): address { receipt.buyer }
    public fun receipt_listing_id(receipt: &MarketReceipt): ID { receipt.listing_id }
    public fun receipt_intel_id(receipt: &MarketReceipt): ID { receipt.intel_id }
    public fun receipt_price_paid(receipt: &MarketReceipt): u64 { receipt.price_paid }

    // ── MarketConfig ──
    public fun platform_fee_bps(config: &MarketConfig): u64 { config.platform_fee_bps }
    public fun config_min_price(config: &MarketConfig): u64 { config.min_price }
    public fun treasury_value(config: &MarketConfig): u64 { config.treasury.value() }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_market_config_for_testing(ctx: &mut TxContext): MarketConfig {
        MarketConfig {
            id: object::new(ctx),
            platform_fee_bps: admin::default_market_fee_bps(),
            min_price: admin::default_market_min_price(),
            max_buyers_cap: admin::default_market_max_buyers(),
            treasury: balance::zero(),
        }
    }

    #[test_only]
    public fun destroy_market_config_for_testing(config: MarketConfig) {
        let MarketConfig { id, platform_fee_bps: _, min_price: _, max_buyers_cap: _, treasury } = config;
        balance::destroy_for_testing(treasury);
        object::delete(id);
    }

    #[test_only]
    public fun create_listing_for_testing(
        seller: address,
        intel_id: ID,
        intel_type: u8,
        region_id: u64,
        price: u64,
        max_buyers: u64,
        expiry: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): IntelListing {
        IntelListing {
            id: object::new(ctx),
            seller,
            intel_id,
            intel_type,
            region_id,
            listing_type: LISTING_TYPE_FIXED,
            price,
            max_buyers,
            sold_count: 0,
            encrypted_payload: vector[0u8, 1u8, 2u8],
            expiry,
            created_at: clock.timestamp_ms(),
            active: true,
            buyers: vec_set::empty(),
        }
    }

    #[test_only]
    public fun destroy_listing_for_testing(listing: IntelListing) {
        let IntelListing {
            id, seller: _, intel_id: _, intel_type: _, region_id: _,
            listing_type: _, price: _, max_buyers: _, sold_count: _,
            encrypted_payload: _, expiry: _, created_at: _, active: _,
            buyers: _,
        } = listing;
        object::delete(id);
    }

    #[test_only]
    public fun create_receipt_for_testing(
        buyer: address,
        listing_id: ID,
        intel_id: ID,
        price_paid: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): MarketReceipt {
        MarketReceipt {
            id: object::new(ctx),
            buyer,
            listing_id,
            intel_id,
            purchased_at: clock.timestamp_ms(),
            price_paid,
        }
    }

    #[test_only]
    public fun destroy_receipt_for_testing(receipt: MarketReceipt) {
        let MarketReceipt { id, buyer: _, listing_id: _, intel_id: _, purchased_at: _, price_paid: _ } = receipt;
        object::delete(id);
    }
}
```

- [ ] **Step 2: Build to verify compilation**

Run: `cd move/frontier_explorer_hub && sui move build`
Expected: `BUILDING frontier_explorer_hub` with no errors

- [ ] **Step 3: Commit**

```bash
git add move/frontier_explorer_hub/sources/market.move
git commit -m "feat(market): add structs, constants, events, accessors, test helpers"
```

---

## Task 3: Implement Core Entry Functions

**Files:**
- Modify: `move/frontier_explorer_hub/sources/market.move` (replace placeholder comments)

- [ ] **Step 1: Write failing tests for list_intel**

Create `move/frontier_explorer_hub/sources/tests/market_tests.move` with:

```move
#[test_only]
module frontier_explorer_hub::market_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_scenario::{Self as ts};

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const OTHER: address = @0xC;

    // ── list_intel tests ──

    #[test]
    fun test_list_intel_success() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000, // 0.1 SUI
            5,           // max 5 buyers
            clock.timestamp_ms() + 86400_000, // 1 day
            vector[0u8, 1u8, 2u8], // encrypted payload
            &config,
            &clock,
            scenario.ctx(),
        );

        // cleanup
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ENotReporter)]
    fun test_list_intel_not_reporter() {
        let mut scenario = ts::begin(OTHER); // OTHER is not the reporter
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1, // reporter = SELLER
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EPriceTooLow)]
    fun test_list_intel_price_too_low() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            1, // price too low (min = 0.01 SUI = 10_000_000)
            5,
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EPayloadTooLarge)]
    fun test_list_intel_payload_too_large() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        // Create payload > 4096 bytes
        let mut big_payload = vector[];
        let mut i = 0;
        while (i < 4097) {
            big_payload.push_back(0u8);
            i = i + 1;
        };

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            big_payload,
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EIntelExpired)]
    fun test_list_intel_intel_expired() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(200_000_000); // advance past intel expiry

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        // intel expiry = clock + 86400_000, but we'll advance clock past it
        clock.increment_for_testing(86_500_000);

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EMaxBuyersExceeded)]
    fun test_list_intel_max_buyers_exceeded() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000,
            101, // exceeds DEFAULT_MAX_BUYERS (100)
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingExpiryInPast)]
    fun test_list_intel_expiry_in_past() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        // Advance clock so expiry can be in past
        clock.increment_for_testing(100_000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            1, // expiry in the past
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }
}
```

- [ ] **Step 2: Run tests — expected FAIL (list_intel not implemented)**

Run: `cd move/frontier_explorer_hub && sui move test --filter market`
Expected: FAIL — `list_intel` function body not found

- [ ] **Step 3: Implement list_intel in market.move**

Replace the core functions placeholder with:

```move
    // ═══════════════════════════════════════════════
    // Core functions
    // ═══════════════════════════════════════════════

    entry fun list_intel(
        intel: &intel::IntelReport,
        price: u64,
        max_buyers: u64,
        expiry: u64,
        encrypted_payload: vector<u8>,
        config: &MarketConfig,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Validations
        assert!(ctx.sender() == intel::reporter(intel), ENotReporter);
        assert!(clock.timestamp_ms() < intel::expiry(intel), EIntelExpired);
        assert!(expiry > clock.timestamp_ms(), EListingExpiryInPast);
        assert!(encrypted_payload.length() <= admin::max_market_payload_size(), EPayloadTooLarge);
        assert!(price >= config.min_price, EPriceTooLow);
        assert!(max_buyers <= config.max_buyers_cap, EMaxBuyersExceeded);

        let location = intel::location(intel);
        let listing = IntelListing {
            id: object::new(ctx),
            seller: ctx.sender(),
            intel_id: object::id(intel),
            intel_type: intel::intel_type(intel),
            region_id: intel::region_id(&location),
            listing_type: LISTING_TYPE_FIXED,
            price,
            max_buyers,
            sold_count: 0,
            encrypted_payload,
            expiry,
            created_at: clock.timestamp_ms(),
            active: true,
            buyers: vec_set::empty(),
        };

        event::emit(ListingCreatedEvent {
            listing_id: object::id(&listing),
            seller: ctx.sender(),
            intel_id: object::id(intel),
            intel_type: intel::intel_type(intel),
            region_id: intel::region_id(&location),
            price,
            max_buyers,
            expiry,
        });

        transfer::share_object(listing);
    }
```

- [ ] **Step 4: Run list_intel tests — expected PASS**

Run: `cd move/frontier_explorer_hub && sui move test --filter market`
Expected: 7 tests pass (5 original + 2 new: EIntelExpired, EMaxBuyersExceeded)

- [ ] **Step 5: Add purchase_intel tests**

Append to market_tests.move:

```move
    // ── purchase_intel tests ──

    #[test]
    fun test_purchase_intel_success() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // Switch to BUYER
        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());

        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        assert!(market::sold_count(&listing) == 1);
        assert!(market::treasury_value(&config) > 0);

        // cleanup
        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ESelfPurchase)]
    fun test_purchase_self_blocked() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // SELLER tries to buy own listing
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EAlreadyPurchased)]
    fun test_purchase_duplicate_blocked() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(1_000_000_000, scenario.ctx());

        // First purchase OK
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );
        // Second purchase FAIL
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EInsufficientPayment)]
    fun test_purchase_insufficient_payment() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5, // price = 0.1 SUI
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(1, scenario.ctx()); // way too little

        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ESoldOut)]
    fun test_purchase_sold_out() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 1, // max 1 buyer
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // BUYER buys
        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        // OTHER tries to buy — sold out
        scenario.next_tx(OTHER);
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }
```

- [ ] **Step 6: Implement purchase_intel**

Add after `list_intel` in market.move:

```move
    entry fun purchase_intel(
        listing: &mut IntelListing,
        payment: &mut Coin<SUI>,
        config: &mut MarketConfig,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(listing.active, EListingNotActive);
        assert!(clock.timestamp_ms() < listing.expiry, EListingNotActive);
        assert!(listing.sold_count < listing.max_buyers, ESoldOut);
        assert!(ctx.sender() != listing.seller, ESelfPurchase);
        assert!(!listing.buyers.contains(&ctx.sender()), EAlreadyPurchased);
        assert!(payment.value() >= listing.price, EInsufficientPayment);

        // Split price from payment
        let mut price_coin = payment.split(listing.price, ctx);

        // Calculate shares
        let platform_fee = listing.price * config.platform_fee_bps / 10000;
        let seller_share = listing.price - platform_fee;

        // Transfer seller share
        let seller_coin = price_coin.split(seller_share, ctx);
        transfer::public_transfer(seller_coin, listing.seller);

        // Deposit platform fee to treasury
        balance::join(&mut config.treasury, coin::into_balance(price_coin));

        // Update listing state
        listing.sold_count = listing.sold_count + 1;
        listing.buyers.insert(ctx.sender());

        // Mint receipt
        let receipt = MarketReceipt {
            id: object::new(ctx),
            buyer: ctx.sender(),
            listing_id: object::id(listing),
            intel_id: listing.intel_id,
            purchased_at: clock.timestamp_ms(),
            price_paid: listing.price,
        };

        event::emit(IntelPurchasedEvent {
            listing_id: object::id(listing),
            buyer: ctx.sender(),
            intel_id: listing.intel_id,
            price_paid: listing.price,
            seller_share,
            platform_fee,
            sold_count: listing.sold_count,
        });

        transfer::transfer(receipt, ctx.sender());
    }
```

- [ ] **Step 7: Run tests — expect purchase tests pass**

Run: `cd move/frontier_explorer_hub && sui move test --filter market`
Expected: 12 tests pass (7 list + 5 purchase: success, self, duplicate, insufficient, sold_out)

- [ ] **Step 8: Add delist, expire, update_price tests + implementations**

Append tests for delist_intel, expire_listing, update_price (happy path + failure cases):

```move
    // ── delist tests ──

    #[test]
    fun test_delist_intel_success() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::delist_intel(&mut listing, scenario.ctx());
        assert!(!market::is_active(&listing));

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ENotSeller)]
    fun test_delist_not_seller() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(OTHER);
        market::delist_intel(&mut listing, scenario.ctx());

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ── expire tests ──

    #[test]
    fun test_expire_listing_success() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        let expiry = clock.timestamp_ms() + 1000;
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, expiry, &clock, scenario.ctx(),
        );

        clock.increment_for_testing(2000); // past expiry
        market::expire_listing(&mut listing, &clock);
        assert!(!market::is_active(&listing));

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingNotExpired)]
    fun test_expire_listing_not_expired() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::expire_listing(&mut listing, &clock); // not expired yet

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ── update_price tests ──

    #[test]
    fun test_update_price_success() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());
        assert!(market::price(&listing) == 200_000_000);

        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ENotSeller)]
    fun test_update_price_not_seller() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(OTHER);
        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());

        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EHasBuyers)]
    fun test_update_price_has_buyers() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // BUYER purchases first
        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(&mut listing, &mut payment, &mut config, &clock, scenario.ctx());

        // SELLER tries to change price after purchase
        scenario.next_tx(SELLER);
        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());

        coin::burn_for_testing(payment);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingNotActive)]
    fun test_update_price_delisted() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::delist_intel(&mut listing, scenario.ctx());
        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());

        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }
```

Implement in market.move:

```move
    entry fun delist_intel(
        listing: &mut IntelListing,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == listing.seller, ENotSeller);
        listing.active = false;

        event::emit(ListingDelistedEvent {
            listing_id: object::id(listing),
            seller: listing.seller,
            sold_count: listing.sold_count,
        });
    }

    entry fun expire_listing(
        listing: &mut IntelListing,
        clock: &Clock,
    ) {
        assert!(clock.timestamp_ms() >= listing.expiry, EListingNotExpired);
        listing.active = false;

        event::emit(ListingExpiredEvent {
            listing_id: object::id(listing),
            sold_count: listing.sold_count,
        });
    }

    entry fun update_price(
        listing: &mut IntelListing,
        new_price: u64,
        config: &MarketConfig,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == listing.seller, ENotSeller);
        assert!(listing.active, EListingNotActive);
        assert!(listing.sold_count == 0, EHasBuyers);
        assert!(new_price >= config.min_price, EPriceTooLow);

        let old_price = listing.price;
        listing.price = new_price;

        event::emit(PriceUpdatedEvent {
            listing_id: object::id(listing),
            old_price,
            new_price,
        });
    }
```

- [ ] **Step 9: Run all market tests**

Run: `cd move/frontier_explorer_hub && sui move test --filter market`
Expected: 21 tests pass (7 list + 5 purchase + 2 delist + 2 expire + 3 update_price + 2 from S2/S3)

- [ ] **Step 10: Commit**

```bash
git add move/frontier_explorer_hub/sources/market.move move/frontier_explorer_hub/sources/tests/market_tests.move
git commit -m "feat(market): implement core entry functions with tests"
```

---

## Task 4: Implement seal_approve + Monkey Tests

**Files:**
- Modify: `move/frontier_explorer_hub/sources/market.move` (replace seal placeholder)
- Modify: `move/frontier_explorer_hub/sources/tests/market_tests.move` (add seal + monkey tests)

- [ ] **Step 1: Write seal_approve test**

```move
    // ── seal_approve tests ──

    #[test]
    fun test_seal_approve_valid_receipt() {
        let mut scenario = ts::begin(BUYER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_id = object::id_from_address(@0xCAFE);
        let listing_id = object::id_from_address(@0xBEEF);

        // Create receipt manually
        let receipt = market::create_receipt_for_testing(
            BUYER, listing_id, intel_id, 100_000_000,
            &clock, scenario.ctx(),
        );

        // id = intel_id bytes + nonce
        let mut id = object::id_to_bytes(&intel_id);
        id.push_back(0u8); // nonce byte

        market::seal_approve(id, &receipt);

        market::destroy_receipt_for_testing(receipt);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EInvalidSealId)]
    fun test_seal_approve_wrong_intel_id() {
        let mut scenario = ts::begin(BUYER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_id = object::id_from_address(@0xCAFE);
        let wrong_intel_id = object::id_from_address(@0xDEAD);
        let listing_id = object::id_from_address(@0xBEEF);

        let receipt = market::create_receipt_for_testing(
            BUYER, listing_id, intel_id, 100_000_000,
            &clock, scenario.ctx(),
        );

        // id = WRONG intel_id bytes
        let id = object::id_to_bytes(&wrong_intel_id);
        market::seal_approve(id, &receipt);

        market::destroy_receipt_for_testing(receipt);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EInvalidSealId)]
    fun test_seal_approve_id_too_short() {
        let mut scenario = ts::begin(BUYER);
        let clock = clock::create_for_testing(scenario.ctx());

        let receipt = market::create_receipt_for_testing(
            BUYER,
            object::id_from_address(@0xBEEF),
            object::id_from_address(@0xCAFE),
            100_000_000,
            &clock, scenario.ctx(),
        );

        // id too short
        market::seal_approve(vector[0u8, 1u8], &receipt);

        market::destroy_receipt_for_testing(receipt);
        clock::destroy_for_testing(clock);
        scenario.end();
    }
```

- [ ] **Step 2: Implement seal_approve**

Replace seal placeholder in market.move:

```move
    // ═══════════════════════════════════════════════
    // Seal policy
    // ═══════════════════════════════════════════════

    /// Seal key server calls this to verify decryption access.
    /// id = [intel_id bytes + nonce]. Namespace must match receipt's intel_id.
    entry fun seal_approve(
        id: vector<u8>,
        receipt: &MarketReceipt,
    ) {
        let namespace = object::id_to_bytes(&receipt.intel_id);
        assert!(id.length() >= namespace.length(), EInvalidSealId);
        let mut i = 0;
        while (i < namespace.length()) {
            assert!(namespace[i] == id[i], EInvalidSealId);
            i = i + 1;
        };
    }
```

- [ ] **Step 3: Add monkey tests (extreme edge cases)**

Note: `create_receipt_for_testing` was already added in Task 2.

```move
    // ── Monkey tests ──

    #[test]
    fun test_monkey_purchase_splits_correctly() {
        // Verify exact fee split with specific amounts
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        // price = 1 SUI = 1_000_000_000 MIST
        // fee = 2.5% = 25_000_000
        // seller gets = 975_000_000
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            1_000_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(2_000_000_000, scenario.ctx());

        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        // Verify treasury got exactly 25_000_000
        assert!(market::treasury_value(&config) == 25_000_000);
        // Verify buyer payment was reduced by exactly 1 SUI
        assert!(payment.value() == 1_000_000_000);

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingNotActive)]
    fun test_monkey_purchase_after_delist() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::delist_intel(&mut listing, scenario.ctx());

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingNotActive)]
    fun test_monkey_purchase_after_expiry() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 1000,
            &clock, scenario.ctx(),
        );

        clock.increment_for_testing(2000); // past expiry

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }
```

- [ ] **Step 4: Run all tests**

Run: `cd move/frontier_explorer_hub && sui move test`
Expected: all tests pass (57 existing + ~27 new market tests)

- [ ] **Step 5: Commit**

```bash
git add move/frontier_explorer_hub/sources/market.move move/frontier_explorer_hub/sources/tests/market_tests.move
git commit -m "feat(market): add seal_approve + monkey tests"
```

---

## Task 5: Frontend Types + Constants

**Files:**
- Modify: `next-monorepo/app/src/types/index.ts:86` (append)
- Modify: `next-monorepo/app/src/lib/constants.ts:9` (add marketConfig)

- [ ] **Step 1: Add types**

Append to `types/index.ts`:

```typescript
export interface IntelListing {
  id: string;
  seller: string;
  intelId: string;
  intelType: number;
  regionId: number;
  listingType: number;
  price: number;
  maxBuyers: number;
  soldCount: number;
  expiry: number;
  createdAt: number;
  active: boolean;
}

export interface MarketReceipt {
  id: string;
  buyer: string;
  listingId: string;
  intelId: string;
  purchasedAt: number;
  pricePaid: number;
}

export interface SellerReputation {
  address: string;
  score: number;
  totalSales: number;
  repeatBuyerRate: number;
  guildName?: string;
  survivalDays?: number;
  onChainAge: number;
}
```

- [ ] **Step 2: Add marketConfig to SHARED_OBJECTS**

```typescript
export const SHARED_OBJECTS = {
  subscriptionConfig: process.env.NEXT_PUBLIC_SUBSCRIPTION_CONFIG_ID ?? "0x0",
  pricingTable: process.env.NEXT_PUBLIC_PRICING_TABLE_ID ?? "0x0",
  pluginRegistry: process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_ID ?? "0x0",
  marketConfig: process.env.NEXT_PUBLIC_MARKET_CONFIG_ID ?? "0x0",
} as const;
```

- [ ] **Step 3: Run tsc to verify types**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/constants.ts
git commit -m "feat(types): add IntelListing, MarketReceipt, SellerReputation types + marketConfig"
```

---

## Task 6: PTB Builders

**Files:**
- Create: `next-monorepo/app/src/lib/ptb/market.ts`
- Create: `next-monorepo/app/src/__tests__/ptb/market.test.ts`

- [ ] **Step 1: Write PTB builder tests**

```typescript
import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import {
  buildListIntel,
  buildPurchaseIntel,
  buildDelistIntel,
  buildExpireListing,
  buildUpdatePrice,
} from "../../lib/ptb/market";

describe("market PTB builders", () => {
  it("buildListIntel adds moveCall", () => {
    const tx = new Transaction();
    buildListIntel(tx, "0xINTEL", 100_000_000, 5, Date.now() + 86400000, new Uint8Array([1, 2, 3]), "0xCLOCK");
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });

  it("buildPurchaseIntel splits coin and calls purchase", () => {
    const tx = new Transaction();
    buildPurchaseIntel(tx, "0xLISTING", 100_000_000, "0xCLOCK");
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(2); // splitCoins + moveCall
  });

  it("buildDelistIntel adds moveCall", () => {
    const tx = new Transaction();
    buildDelistIntel(tx, "0xLISTING");
    expect(tx.getData().commands.length).toBe(1);
  });

  it("buildExpireListing adds moveCall", () => {
    const tx = new Transaction();
    buildExpireListing(tx, "0xLISTING", "0xCLOCK");
    expect(tx.getData().commands.length).toBe(1);
  });

  it("buildUpdatePrice adds moveCall", () => {
    const tx = new Transaction();
    buildUpdatePrice(tx, "0xLISTING", 200_000_000);
    expect(tx.getData().commands.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expected FAIL**

Run: `cd next-monorepo && npx vitest run src/__tests__/ptb/market.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PTB builders**

Create `next-monorepo/app/src/lib/ptb/market.ts`:

```typescript
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, SHARED_OBJECTS } from "../constants";

export function buildListIntel(
  tx: Transaction,
  intelId: string,
  priceMist: number,
  maxBuyers: number,
  expiryMs: number,
  encryptedPayload: Uint8Array,
  clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::list_intel`,
    arguments: [
      tx.object(intelId),
      tx.pure.u64(priceMist),
      tx.pure.u64(maxBuyers),
      tx.pure.u64(expiryMs),
      tx.pure.vector("u8", Array.from(encryptedPayload)),
      tx.object(SHARED_OBJECTS.marketConfig),
      tx.object(clockId),
    ],
  });
  return tx;
}

export function buildPurchaseIntel(
  tx: Transaction,
  listingId: string,
  priceMist: number,
  clockId: string,
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::market::purchase_intel`,
    arguments: [
      tx.object(listingId),
      paymentCoin,
      tx.object(SHARED_OBJECTS.marketConfig),
      tx.object(clockId),
    ],
  });
  return tx;
}

export function buildDelistIntel(
  tx: Transaction,
  listingId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::delist_intel`,
    arguments: [tx.object(listingId)],
  });
  return tx;
}

export function buildExpireListing(
  tx: Transaction,
  listingId: string,
  clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::expire_listing`,
    arguments: [tx.object(listingId), tx.object(clockId)],
  });
  return tx;
}

export function buildUpdatePrice(
  tx: Transaction,
  listingId: string,
  newPriceMist: number,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::update_price`,
    arguments: [
      tx.object(listingId),
      tx.pure.u64(newPriceMist),
      tx.object(SHARED_OBJECTS.marketConfig),
    ],
  });
  return tx;
}
```

- [ ] **Step 4: Run tests — expected PASS**

Run: `cd next-monorepo && npx vitest run src/__tests__/ptb/market.test.ts`
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/lib/ptb/market.ts next-monorepo/app/src/__tests__/ptb/market.test.ts
git commit -m "feat(ptb): add market PTB builders with tests"
```

---

## Task 7: API Client + Hook

**Files:**
- Modify: `next-monorepo/app/src/lib/api-client.ts` (add market endpoints)
- Create: `next-monorepo/app/src/hooks/use-market.ts`
- Create: `next-monorepo/app/src/__tests__/hooks/use-market.test.ts`

- [ ] **Step 1: Update api-client.ts imports + add market endpoints**

Update import at line 2:

```typescript
import type { AggregatedCell, IntelReport, BountyRequest, SubscriptionStatus, IntelListing, MarketReceipt, SellerReputation } from "@/types";
```

Append market API endpoints:

```typescript
export async function getMarketListings(params?: {
  region?: number;
  type?: number;
  sort?: string;
}): Promise<{ listings: IntelListing[] }> {
  const query = new URLSearchParams();
  if (params?.region != null) query.set("region", String(params.region));
  if (params?.type != null) query.set("type", String(params.type));
  if (params?.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return apiFetch(`/api/market/listings${qs ? `?${qs}` : ""}`);
}

export async function getMarketListing(id: string): Promise<{ listing: IntelListing; reputation: SellerReputation }> {
  return apiFetch(`/api/market/listings/${id}`);
}

export async function getMyPurchases(): Promise<{ purchases: MarketReceipt[] }> {
  return apiFetch("/api/market/purchases");
}

export async function getMySales(): Promise<{ listings: IntelListing[] }> {
  return apiFetch("/api/market/sales");
}

export async function getReputation(address: string): Promise<SellerReputation> {
  return apiFetch(`/api/reputation/${address}`);
}
```

- [ ] **Step 2: Implement use-market hook**

Create `next-monorepo/app/src/hooks/use-market.ts`:

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getMarketListings } from "@/lib/api-client";
import {
  buildListIntel,
  buildPurchaseIntel,
  buildDelistIntel,
  buildUpdatePrice,
} from "@/lib/ptb/market";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "./use-auth";

const CLOCK_ID = "0x6";

export function useMarket(params?: { region?: number; type?: number; sort?: string }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ["market-listings", params],
    queryFn: () => getMarketListings(params),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const listIntel = useMutation({
    mutationFn: async (p: {
      intelId: string;
      priceMist: number;
      maxBuyers: number;
      expiryMs: number;
      encryptedPayload: Uint8Array;
    }) => {
      const tx = new Transaction();
      buildListIntel(tx, p.intelId, p.priceMist, p.maxBuyers, p.expiryMs, p.encryptedPayload, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Intel listed!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `List failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    },
  });

  const purchaseIntel = useMutation({
    mutationFn: async ({ listingId, priceMist }: { listingId: string; priceMist: number }) => {
      const tx = new Transaction();
      buildPurchaseIntel(tx, listingId, priceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Intel purchased!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Purchase failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    },
  });

  const delistIntel = useMutation({
    mutationFn: async ({ listingId }: { listingId: string }) => {
      const tx = new Transaction();
      buildDelistIntel(tx, listingId);
      const result = await signAndExecute({ transaction: tx as never });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Listing removed!" });
    },
  });

  const updatePrice = useMutation({
    mutationFn: async ({ listingId, newPriceMist }: { listingId: string; newPriceMist: number }) => {
      const tx = new Transaction();
      buildUpdatePrice(tx, listingId, newPriceMist);
      const result = await signAndExecute({ transaction: tx as never });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Price updated!" });
    },
  });

  return {
    listings: query.data?.listings ?? [],
    isLoading: query.isLoading,
    listIntel: listIntel.mutateAsync,
    purchaseIntel: purchaseIntel.mutateAsync,
    delistIntel: delistIntel.mutateAsync,
    updatePrice: updatePrice.mutateAsync,
    isListing: listIntel.isPending,
    isPurchasing: purchaseIntel.isPending,
  };
}
```

- [ ] **Step 3: Write use-market hook tests**

Create `next-monorepo/app/src/__tests__/hooks/use-market.test.ts` following the same mock pattern as `use-bounties.test.ts`/`use-subscription.test.ts`. Tests should cover:
- `useMarket()` returns empty listings when no data
- `listIntel` calls `signAndExecute`
- `purchaseIntel` calls `signAndExecute`
- `delistIntel` invalidates query cache

- [ ] **Step 4: Run all frontend tests**

Run: `cd next-monorepo && npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Run tsc**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/lib/api-client.ts next-monorepo/app/src/hooks/use-market.ts next-monorepo/app/src/__tests__/hooks/use-market.test.ts
git commit -m "feat(market): add API endpoints + useMarket hook with tests"
```

---

## Task 8: Full Build Verification + All Tests

**Files:** None (verification only)

- [ ] **Step 1: Run Move build**

Run: `cd move/frontier_explorer_hub && sui move build`
Expected: no errors

- [ ] **Step 2: Run all Move tests**

Run: `cd move/frontier_explorer_hub && sui move test`
Expected: all tests pass (57 existing + ~21 new)

- [ ] **Step 3: Run frontend tsc**

Run: `cd next-monorepo && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run all frontend tests**

Run: `cd next-monorepo && npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Final commit if any fixes needed**

---

## Dependencies

```
Task 1 (admin constants) ──▶ Task 2 (market structs) ──▶ Task 3 (core functions) ──▶ Task 4 (seal + monkey)
                                                                                         │
Task 5 (types + constants) ────────────────────────────────────────────────────────────────┤
                                                                                         │
Task 6 (PTB builders) ──▶ Task 7 (API + hook) ──▶ Task 8 (verification)
```

Tasks 1-4 (Move) and Tasks 5-6 (Frontend) can run in parallel.
Task 7 depends on Task 5.
Task 8 depends on all.
