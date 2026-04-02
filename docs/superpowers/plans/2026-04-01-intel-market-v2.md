# Intel Market v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dual-mode encrypted intel marketplace (sell + bounty) with Seal encryption and seller reputation system in the FEH app.

**Architecture:** New Move module `intel_market.move` alongside existing `market.move`. Frontend replaces `/submit` with `/intel-market` page using 3 sub-tabs (Sell Intel, Bounty Board, My Activity). Seal SDK for client-side encryption/decryption.

**Tech Stack:** Move (Sui), Seal protocol (`@aspect-build/seal-client`), React, TypeScript, @mysten/dapp-kit, @tanstack/react-query, Zustand, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-01-intel-market-v2-design.md`

---

## Task 1: Move — SellerProfile + Sell Mode Structs & Functions

**Files:**
- Create: `move/frontier_explorer_hub/sources/intel_market.move`

- [ ] **Step 1: Create module with structs and constants**

```move
module frontier_explorer_hub::intel_market {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    // ═══════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════

    // Listing status
    const LISTING_ACTIVE: u8 = 0;
    const LISTING_SOLD: u8 = 1;
    const LISTING_EXPIRED: u8 = 2;
    const LISTING_CANCELLED: u8 = 3;

    // Intel types
    const INTEL_RESOURCE: u8 = 0;
    const INTEL_THREAT: u8 = 1;
    const INTEL_WRECKAGE: u8 = 2;
    const INTEL_POPULATION: u8 = 3;
    const INTEL_TYPE_COUNT: u8 = 4;

    // Limits
    const MAX_TITLE_LENGTH: u64 = 256;
    const MAX_ENCRYPTED_PAYLOAD: u64 = 4096;
    const MIN_LISTING_FEE: u64 = 10_000_000; // 0.01 SUI
    const AUTO_RELEASE_MS: u64 = 86_400_000; // 24h
    const MAX_SEVERITY: u8 = 10;
    const MIN_RATING: u8 = 1;
    const MAX_RATING: u8 = 5;
    const DEFAULT_RATING: u8 = 3;

    // Error codes (300 series — avoid conflict with market.move 200s)
    const ENotSeller: u64 = 300;
    const ENotBuyer: u64 = 301;
    const EListingNotActive: u64 = 302;
    const EListingNotSold: u64 = 303;
    const EAlreadySealed: u64 = 304;
    const ENotSealed: u64 = 305;
    const ETitleTooLong: u64 = 306;
    const EPayloadTooLarge: u64 = 307;
    const EInvalidIntelType: u64 = 308;
    const EInvalidSeverity: u64 = 309;
    const EInvalidRating: u64 = 310;
    const EInsufficientFee: u64 = 311;
    const EInsufficientPayment: u64 = 312;
    const ESelfPurchase: u64 = 313;
    const ENotExpired: u64 = 314;
    const EAutoReleaseNotReady: u64 = 315;
    const EExpiryInPast: u64 = 316;
    const EHasBuyer: u64 = 317;
    const EInvalidSealId: u64 = 318;
    const EPayloadEmpty: u64 = 319;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct PublicMeta has store, copy, drop {
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        intel_type: u8,
        severity: u8,
        expiry: u64,
    }

    public struct IntelListing has key {
        id: UID,
        seller: address,
        title: vector<u8>,
        public_metadata: PublicMeta,
        encrypted_payload: vector<u8>,
        price_mist: u64,
        listing_fee: Balance<SUI>,
        status: u8,
        payment: Balance<SUI>,
        buyer: Option<address>,
        purchased_at: Option<u64>,
        created_at: u64,
        is_sealed: bool,
    }

    public struct ListingViewerReceipt has key {
        id: UID,
        listing_id: ID,
    }

    public struct SellerProfile has key {
        id: UID,
        seller: address,
        total_trades: u64,
        total_score: u64,
        total_weighted_score: u64,
        total_volume_mist: u64,
        created_at: u64,
    }

    // ═══════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════

    public struct ListingCreatedEvent has copy, drop {
        listing_id: ID,
        seller: address,
        title: vector<u8>,
        intel_type: u8,
        region_id: u64,
        price_mist: u64,
        expiry: u64,
    }

    public struct ListingSealedEvent has copy, drop {
        listing_id: ID,
    }

    public struct IntelPurchasedEvent has copy, drop {
        listing_id: ID,
        buyer: address,
        price_mist: u64,
    }

    public struct IntelConfirmedEvent has copy, drop {
        listing_id: ID,
        buyer: address,
        seller: address,
        price_mist: u64,
        rating: u8,
    }

    public struct AutoReleasedEvent has copy, drop {
        listing_id: ID,
        seller: address,
        price_mist: u64,
    }

    public struct ListingCancelledEvent has copy, drop {
        listing_id: ID,
        seller: address,
    }

    public struct ListingExpiredEvent has copy, drop {
        listing_id: ID,
    }

    public struct ProfileCreatedEvent has copy, drop {
        profile_id: ID,
        seller: address,
    }
```

- [ ] **Step 2: Implement `create_seller_profile`**

```move
    // ═══════════════════════════════════════════════
    // Seller Profile
    // ═══════════════════════════════════════════════

    public fun create_seller_profile(
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let profile = SellerProfile {
            id: object::new(ctx),
            seller: ctx.sender(),
            total_trades: 0,
            total_score: 0,
            total_weighted_score: 0,
            total_volume_mist: 0,
            created_at: clock.timestamp_ms(),
        };
        event::emit(ProfileCreatedEvent {
            profile_id: object::id(&profile),
            seller: ctx.sender(),
        });
        transfer::share_object(profile);
    }

    fun update_profile(
        profile: &mut SellerProfile,
        rating: u8,
        price_mist: u64,
    ) {
        profile.total_trades = profile.total_trades + 1;
        profile.total_score = profile.total_score + (rating as u64);
        profile.total_weighted_score = profile.total_weighted_score + (rating as u64) * price_mist;
        profile.total_volume_mist = profile.total_volume_mist + price_mist;
    }
```

- [ ] **Step 3: Implement `list_intel` (TX1 for seller)**

```move
    // ═══════════════════════════════════════════════
    // Sell Mode
    // ═══════════════════════════════════════════════

    public fun list_intel(
        title: vector<u8>,
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        intel_type: u8,
        severity: u8,
        expiry: u64,
        price_mist: u64,
        fee_coin: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        assert!(title.length() <= MAX_TITLE_LENGTH, ETitleTooLong);
        assert!(intel_type < INTEL_TYPE_COUNT, EInvalidIntelType);
        assert!(severity <= MAX_SEVERITY, EInvalidSeverity);
        assert!(expiry > clock.timestamp_ms(), EExpiryInPast);
        assert!(fee_coin.value() >= MIN_LISTING_FEE, EInsufficientFee);

        let listing = IntelListing {
            id: object::new(ctx),
            seller: ctx.sender(),
            title,
            public_metadata: PublicMeta {
                region_id,
                sector_x,
                sector_y,
                sector_z,
                intel_type,
                severity,
                expiry,
            },
            encrypted_payload: vector[],
            price_mist,
            listing_fee: coin::into_balance(fee_coin),
            status: LISTING_ACTIVE,
            payment: balance::zero(),
            buyer: option::none(),
            purchased_at: option::none(),
            created_at: clock.timestamp_ms(),
            is_sealed: false,
        };

        let listing_id = object::id(&listing);

        event::emit(ListingCreatedEvent {
            listing_id,
            seller: ctx.sender(),
            title,
            intel_type,
            region_id,
            price_mist,
            expiry,
        });

        transfer::share_object(listing);
        listing_id
    }
```

- [ ] **Step 4: Implement `set_encrypted_payload` (TX2 for seller)**

```move
    public fun set_encrypted_payload(
        listing: &mut IntelListing,
        encrypted_payload: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == listing.seller, ENotSeller);
        assert!(!listing.is_sealed, EAlreadySealed);
        assert!(encrypted_payload.length() > 0, EPayloadEmpty);
        assert!(encrypted_payload.length() <= MAX_ENCRYPTED_PAYLOAD, EPayloadTooLarge);

        listing.encrypted_payload = encrypted_payload;
        listing.is_sealed = true;

        event::emit(ListingSealedEvent {
            listing_id: object::id(listing),
        });
    }
```

- [ ] **Step 5: Implement `purchase_intel` (TX1 for buyer)**

```move
    public fun purchase_intel(
        listing: &mut IntelListing,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(listing.status == LISTING_ACTIVE, EListingNotActive);
        assert!(listing.is_sealed, ENotSealed);
        assert!(clock.timestamp_ms() < listing.public_metadata.expiry, EListingNotActive);
        assert!(ctx.sender() != listing.seller, ESelfPurchase);
        assert!(listing.buyer.is_none(), EHasBuyer);
        assert!(payment.value() >= listing.price_mist, EInsufficientPayment);

        balance::join(&mut listing.payment, coin::into_balance(payment));
        listing.buyer = option::some(ctx.sender());
        listing.purchased_at = option::some(clock.timestamp_ms());
        listing.status = LISTING_SOLD;

        // Mint viewer receipt for Seal decryption
        let receipt = ListingViewerReceipt {
            id: object::new(ctx),
            listing_id: object::id(listing),
        };

        event::emit(IntelPurchasedEvent {
            listing_id: object::id(listing),
            buyer: ctx.sender(),
            price_mist: listing.price_mist,
        });

        transfer::transfer(receipt, ctx.sender());
    }
```

- [ ] **Step 6: Implement `confirm_and_rate` (TX2 for buyer)**

```move
    public fun confirm_and_rate(
        listing: &mut IntelListing,
        profile: &mut SellerProfile,
        rating: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(listing.status == LISTING_SOLD, EListingNotSold);
        assert!(listing.buyer == option::some(ctx.sender()), ENotBuyer);
        assert!(rating >= MIN_RATING && rating <= MAX_RATING, EInvalidRating);
        assert!(profile.seller == listing.seller, ENotSeller);

        let price = listing.payment.value();

        // Release payment to seller
        let payment_coin = coin::from_balance(
            listing.payment.split(listing.payment.value()),
            ctx,
        );
        transfer::public_transfer(payment_coin, listing.seller);

        // Refund listing fee to seller
        let fee_coin = coin::from_balance(
            listing.listing_fee.split(listing.listing_fee.value()),
            ctx,
        );
        transfer::public_transfer(fee_coin, listing.seller);

        // Update profile
        update_profile(profile, rating, price);

        event::emit(IntelConfirmedEvent {
            listing_id: object::id(listing),
            buyer: ctx.sender(),
            seller: listing.seller,
            price_mist: price,
            rating,
        });
    }
```

- [ ] **Step 7: Implement `auto_release` (permissionless)**

```move
    public fun auto_release(
        listing: &mut IntelListing,
        profile: &mut SellerProfile,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(listing.status == LISTING_SOLD, EListingNotSold);
        let purchased_at = *listing.purchased_at.borrow();
        assert!(clock.timestamp_ms() > purchased_at + AUTO_RELEASE_MS, EAutoReleaseNotReady);
        assert!(profile.seller == listing.seller, ENotSeller);

        let price = listing.payment.value();

        // Release payment to seller
        let payment_coin = coin::from_balance(
            listing.payment.split(listing.payment.value()),
            ctx,
        );
        transfer::public_transfer(payment_coin, listing.seller);

        // Refund listing fee
        let fee_coin = coin::from_balance(
            listing.listing_fee.split(listing.listing_fee.value()),
            ctx,
        );
        transfer::public_transfer(fee_coin, listing.seller);

        // Default rating
        update_profile(profile, DEFAULT_RATING, price);

        event::emit(AutoReleasedEvent {
            listing_id: object::id(listing),
            seller: listing.seller,
            price_mist: price,
        });
    }
```

- [ ] **Step 8: Implement cancel, expire, seal_approve + accessors**

```move
    public fun cancel_listing(
        listing: &mut IntelListing,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == listing.seller, ENotSeller);
        assert!(listing.status == LISTING_ACTIVE, EListingNotActive);
        assert!(listing.buyer.is_none(), EHasBuyer);

        listing.status = LISTING_CANCELLED;
        // listing_fee NOT refunded (spam cost)

        event::emit(ListingCancelledEvent {
            listing_id: object::id(listing),
            seller: listing.seller,
        });
    }

    public fun expire_listing(
        listing: &mut IntelListing,
        clock: &Clock,
    ) {
        assert!(listing.status == LISTING_ACTIVE, EListingNotActive);
        assert!(clock.timestamp_ms() >= listing.public_metadata.expiry, ENotExpired);

        listing.status = LISTING_EXPIRED;

        event::emit(ListingExpiredEvent {
            listing_id: object::id(listing),
        });
    }

    /// Seal key server entry point for listing decryption
    entry fun seal_approve_listing(
        id: vector<u8>,
        receipt: &ListingViewerReceipt,
    ) {
        let namespace = object::id_to_bytes(&receipt.listing_id);
        assert!(id.length() >= namespace.length(), EInvalidSealId);
        let mut i = 0;
        while (i < namespace.length()) {
            assert!(namespace[i] == id[i], EInvalidSealId);
            i = i + 1;
        };
    }

    // ═══════════════════════════════════════════════
    // Accessors — IntelListing
    // ═══════════════════════════════════════════════

    public fun listing_seller(listing: &IntelListing): address { listing.seller }
    public fun listing_title(listing: &IntelListing): &vector<u8> { &listing.title }
    public fun listing_metadata(listing: &IntelListing): &PublicMeta { &listing.public_metadata }
    public fun listing_price(listing: &IntelListing): u64 { listing.price_mist }
    public fun listing_status(listing: &IntelListing): u8 { listing.status }
    public fun listing_buyer(listing: &IntelListing): &Option<address> { &listing.buyer }
    public fun listing_is_sealed(listing: &IntelListing): bool { listing.is_sealed }
    public fun listing_created_at(listing: &IntelListing): u64 { listing.created_at }
    public fun listing_purchased_at(listing: &IntelListing): &Option<u64> { &listing.purchased_at }

    // ═══════════════════════════════════════════════
    // Accessors — PublicMeta
    // ═══════════════════════════════════════════════

    public fun meta_region_id(meta: &PublicMeta): u64 { meta.region_id }
    public fun meta_intel_type(meta: &PublicMeta): u8 { meta.intel_type }
    public fun meta_severity(meta: &PublicMeta): u8 { meta.severity }
    public fun meta_expiry(meta: &PublicMeta): u64 { meta.expiry }

    // ═══════════════════════════════════════════════
    // Accessors — SellerProfile
    // ═══════════════════════════════════════════════

    public fun profile_seller(profile: &SellerProfile): address { profile.seller }
    public fun profile_total_trades(profile: &SellerProfile): u64 { profile.total_trades }
    public fun profile_total_score(profile: &SellerProfile): u64 { profile.total_score }
    public fun profile_total_volume(profile: &SellerProfile): u64 { profile.total_volume_mist }

    // ═══════════════════════════════════════════════
    // Accessors — ListingViewerReceipt
    // ═══════════════════════════════════════════════

    public fun receipt_listing_id(receipt: &ListingViewerReceipt): ID { receipt.listing_id }
```

- [ ] **Step 9: Run `sui move build` to verify compilation**

Run: `cd move/frontier_explorer_hub && sui move build`
Expected: Build Successful

- [ ] **Step 10: Commit**

```bash
git add move/frontier_explorer_hub/sources/intel_market.move
git commit -m "feat(move): add intel_market module — sell mode structs and functions"
```

---

## Task 2: Move — Bounty Mode (IntelRequest + Submissions)

**Files:**
- Modify: `move/frontier_explorer_hub/sources/intel_market.move`

- [ ] **Step 1: Add request constants, error codes, and structs**

Append to the constants section:

```move
    // Request status
    const REQUEST_OPEN: u8 = 0;
    const REQUEST_REVIEWING: u8 = 1;
    const REQUEST_COMPLETED: u8 = 2;
    const REQUEST_CANCELLED: u8 = 3;
    const REQUEST_EXPIRED: u8 = 4;

    // Request limits
    const MAX_DESCRIPTION_LENGTH: u64 = 1024;
    const MIN_DEADLINE_MS: u64 = 3_600_000;   // 1h
    const MAX_DEADLINE_MS: u64 = 604_800_000;  // 7d
    const REVIEW_TIMEOUT_MS: u64 = 86_400_000; // 24h

    // Error codes (320 series)
    const ERequestNotOpen: u64 = 320;
    const ERequestNotReviewing: u64 = 321;
    const EDescriptionTooLong: u64 = 322;
    const EDeadlineInvalid: u64 = 323;
    const EHasSubmissions: u64 = 324;
    const EAutoSettleNotReady: u64 = 325;
    const ESellerNotFound: u64 = 326;
    const EAlreadySubmitted: u64 = 327;
    const ERequestDeadlinePassed: u64 = 328;
    const EInvalidSealRequestId: u64 = 329;
```

Append to the structs section:

```move
    public struct IntelRequest has key {
        id: UID,
        buyer: address,
        title: vector<u8>,
        intel_type: u8,
        region_id: u64,
        description: vector<u8>,
        reward: Balance<SUI>,
        deadline: u64,
        status: u8,
        first_submission_at: Option<u64>,
        submission_count: u64,
        selected_seller: Option<address>,
        created_at: u64,
    }

    public struct SubmissionKey has store, copy, drop { seller: address }

    public struct IntelSubmission has store {
        seller: address,
        encrypted_payload: vector<u8>,
        submitted_at: u64,
    }

    public struct RequestViewerReceipt has key {
        id: UID,
        request_id: ID,
    }

    // Events
    public struct RequestCreatedEvent has copy, drop {
        request_id: ID,
        buyer: address,
        title: vector<u8>,
        intel_type: u8,
        region_id: u64,
        reward_mist: u64,
        deadline: u64,
    }

    public struct SubmissionPostedEvent has copy, drop {
        request_id: ID,
        seller: address,
        submission_count: u64,
    }

    public struct RequestCompletedEvent has copy, drop {
        request_id: ID,
        buyer: address,
        seller: address,
        reward_mist: u64,
        rating: u8,
    }

    public struct AutoSettledEvent has copy, drop {
        request_id: ID,
        seller: address,
        reward_mist: u64,
    }

    public struct RequestCancelledEvent has copy, drop {
        request_id: ID,
        buyer: address,
    }

    public struct RequestExpiredEvent has copy, drop {
        request_id: ID,
    }
```

- [ ] **Step 2: Implement `post_request`**

```move
    // ═══════════════════════════════════════════════
    // Bounty Mode
    // ═══════════════════════════════════════════════

    public fun post_request(
        title: vector<u8>,
        intel_type: u8,
        region_id: u64,
        description: vector<u8>,
        reward_coin: Coin<SUI>,
        deadline: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        assert!(title.length() <= MAX_TITLE_LENGTH, ETitleTooLong);
        assert!(intel_type < INTEL_TYPE_COUNT, EInvalidIntelType);
        assert!(description.length() <= MAX_DESCRIPTION_LENGTH, EDescriptionTooLong);
        let now = clock.timestamp_ms();
        let duration = deadline - now;
        assert!(deadline > now && duration >= MIN_DEADLINE_MS && duration <= MAX_DEADLINE_MS, EDeadlineInvalid);

        let request = IntelRequest {
            id: object::new(ctx),
            buyer: ctx.sender(),
            title,
            intel_type,
            region_id,
            description,
            reward: coin::into_balance(reward_coin),
            deadline,
            status: REQUEST_OPEN,
            first_submission_at: option::none(),
            submission_count: 0,
            selected_seller: option::none(),
            created_at: now,
        };

        let request_id = object::id(&request);

        event::emit(RequestCreatedEvent {
            request_id,
            buyer: ctx.sender(),
            title,
            intel_type,
            region_id,
            reward_mist: request.reward.value(),
            deadline,
        });

        transfer::share_object(request);
        request_id
    }
```

- [ ] **Step 3: Implement `fulfill_request`**

```move
    public fun fulfill_request(
        request: &mut IntelRequest,
        encrypted_payload: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            request.status == REQUEST_OPEN || request.status == REQUEST_REVIEWING,
            ERequestNotOpen,
        );
        assert!(encrypted_payload.length() > 0, EPayloadEmpty);
        assert!(encrypted_payload.length() <= MAX_ENCRYPTED_PAYLOAD, EPayloadTooLarge);
        // If no submissions yet, check deadline
        if (request.submission_count == 0) {
            assert!(clock.timestamp_ms() < request.deadline, ERequestDeadlinePassed);
        };
        // Check not already submitted by this seller
        let key = SubmissionKey { seller: ctx.sender() };
        assert!(!sui::dynamic_field::exists_(&request.id, key), EAlreadySubmitted);

        let now = clock.timestamp_ms();

        // First submission starts countdown
        if (request.first_submission_at.is_none()) {
            request.first_submission_at = option::some(now);
            request.status = REQUEST_REVIEWING;
        };

        request.submission_count = request.submission_count + 1;

        // Store submission as DF
        sui::dynamic_field::add(
            &mut request.id,
            key,
            IntelSubmission {
                seller: ctx.sender(),
                encrypted_payload,
                submitted_at: now,
            },
        );

        // Mint viewer receipt for buyer
        let receipt = RequestViewerReceipt {
            id: object::new(ctx),
            request_id: object::id(request),
        };
        transfer::transfer(receipt, request.buyer);

        event::emit(SubmissionPostedEvent {
            request_id: object::id(request),
            seller: ctx.sender(),
            submission_count: request.submission_count,
        });
    }
```

- [ ] **Step 4: Implement `accept_and_rate`**

```move
    public fun accept_and_rate(
        request: &mut IntelRequest,
        profile: &mut SellerProfile,
        seller_addr: address,
        rating: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(request.status == REQUEST_REVIEWING, ERequestNotReviewing);
        assert!(ctx.sender() == request.buyer, ENotBuyer);
        assert!(rating >= MIN_RATING && rating <= MAX_RATING, EInvalidRating);
        assert!(profile.seller == seller_addr, ENotSeller);

        // Verify submission exists
        let key = SubmissionKey { seller: seller_addr };
        assert!(sui::dynamic_field::exists_(&request.id, key), ESellerNotFound);

        let reward_amount = request.reward.value();

        // Release reward to selected seller
        let reward_coin = coin::from_balance(
            request.reward.split(request.reward.value()),
            ctx,
        );
        transfer::public_transfer(reward_coin, seller_addr);

        request.selected_seller = option::some(seller_addr);
        request.status = REQUEST_COMPLETED;

        // Update profile
        update_profile(profile, rating, reward_amount);

        event::emit(RequestCompletedEvent {
            request_id: object::id(request),
            buyer: request.buyer,
            seller: seller_addr,
            reward_mist: reward_amount,
            rating,
        });
    }
```

- [ ] **Step 5: Implement `auto_settle_request`**

```move
    public fun auto_settle_request(
        request: &mut IntelRequest,
        profile: &mut SellerProfile,
        first_seller: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(request.status == REQUEST_REVIEWING, ERequestNotReviewing);
        let first_at = *request.first_submission_at.borrow();
        assert!(clock.timestamp_ms() > first_at + REVIEW_TIMEOUT_MS, EAutoSettleNotReady);

        // Verify first_seller submitted
        let key = SubmissionKey { seller: first_seller };
        assert!(sui::dynamic_field::exists_(&request.id, key), ESellerNotFound);

        // Verify this is actually the first submitter (by submitted_at)
        let submission: &IntelSubmission = sui::dynamic_field::borrow(&request.id, key);
        assert!(submission.submitted_at == first_at, ESellerNotFound);
        assert!(profile.seller == first_seller, ENotSeller);

        let reward_amount = request.reward.value();

        let reward_coin = coin::from_balance(
            request.reward.split(request.reward.value()),
            ctx,
        );
        transfer::public_transfer(reward_coin, first_seller);

        request.selected_seller = option::some(first_seller);
        request.status = REQUEST_COMPLETED;

        update_profile(profile, DEFAULT_RATING, reward_amount);

        event::emit(AutoSettledEvent {
            request_id: object::id(request),
            seller: first_seller,
            reward_mist: reward_amount,
        });
    }
```

- [ ] **Step 6: Implement cancel, expire, seal_approve for requests + accessors**

```move
    public fun cancel_request(
        request: &mut IntelRequest,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == request.buyer, ENotBuyer);
        assert!(request.submission_count == 0, EHasSubmissions);
        assert!(
            request.status == REQUEST_OPEN,
            ERequestNotOpen,
        );

        request.status = REQUEST_CANCELLED;

        // Refund reward
        let reward_coin = coin::from_balance(
            request.reward.split(request.reward.value()),
            ctx,
        );
        transfer::public_transfer(reward_coin, request.buyer);

        event::emit(RequestCancelledEvent {
            request_id: object::id(request),
            buyer: request.buyer,
        });
    }

    public fun expire_request(
        request: &mut IntelRequest,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(request.status == REQUEST_OPEN, ERequestNotOpen);
        assert!(request.submission_count == 0, EHasSubmissions);
        assert!(clock.timestamp_ms() >= request.deadline, ENotExpired);

        request.status = REQUEST_EXPIRED;

        let reward_coin = coin::from_balance(
            request.reward.split(request.reward.value()),
            ctx,
        );
        transfer::public_transfer(reward_coin, request.buyer);

        event::emit(RequestExpiredEvent {
            request_id: object::id(request),
        });
    }

    entry fun seal_approve_request(
        id: vector<u8>,
        receipt: &RequestViewerReceipt,
    ) {
        let namespace = object::id_to_bytes(&receipt.request_id);
        assert!(id.length() >= namespace.length(), EInvalidSealRequestId);
        let mut i = 0;
        while (i < namespace.length()) {
            assert!(namespace[i] == id[i], EInvalidSealRequestId);
            i = i + 1;
        };
    }

    // ═══════════════════════════════════════════════
    // Accessors — IntelRequest
    // ═══════════════════════════════════════════════

    public fun request_buyer(r: &IntelRequest): address { r.buyer }
    public fun request_title(r: &IntelRequest): &vector<u8> { &r.title }
    public fun request_intel_type(r: &IntelRequest): u8 { r.intel_type }
    public fun request_region_id(r: &IntelRequest): u64 { r.region_id }
    public fun request_description(r: &IntelRequest): &vector<u8> { &r.description }
    public fun request_reward_value(r: &IntelRequest): u64 { r.reward.value() }
    public fun request_deadline(r: &IntelRequest): u64 { r.deadline }
    public fun request_status(r: &IntelRequest): u8 { r.status }
    public fun request_submission_count(r: &IntelRequest): u64 { r.submission_count }
    public fun request_first_submission_at(r: &IntelRequest): &Option<u64> { &r.first_submission_at }
    public fun request_selected_seller(r: &IntelRequest): &Option<address> { &r.selected_seller }

    // ═══════════════════════════════════════════════
    // Accessors — RequestViewerReceipt
    // ═══════════════════════════════════════════════

    public fun request_receipt_id(receipt: &RequestViewerReceipt): ID { receipt.request_id }
} // end module
```

- [ ] **Step 7: Run `sui move build`**

Run: `cd move/frontier_explorer_hub && sui move build`
Expected: Build Successful

- [ ] **Step 8: Commit**

```bash
git add move/frontier_explorer_hub/sources/intel_market.move
git commit -m "feat(move): add bounty mode to intel_market — requests, submissions, auto-settle"
```

---

## Task 3: Move — Unit Tests

**Files:**
- Create: `move/frontier_explorer_hub/tests/intel_market_tests.move`

- [ ] **Step 1: Write test helpers and sell mode tests**

```move
#[test_only]
module frontier_explorer_hub::intel_market_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const OUTSIDER: address = @0xC;

    #[test]
    fun test_list_and_seal() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // List intel
        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        let listing_id = intel_market::list_intel(
            b"Threat near Region 42",
            42, 10, 20, 30,  // region, sector x/y/z
            1,               // THREAT
            8,               // severity
            100_000_000,     // expiry
            500_000_000,     // price 0.5 SUI
            fee,
            &clk,
            scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        assert!(!intel_market::listing_is_sealed(&listing));

        // Seal
        intel_market::set_encrypted_payload(&mut listing, b"secret_data_encrypted", scenario.ctx());
        assert!(intel_market::listing_is_sealed(&listing));

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_purchase_confirm_rate() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Create profile
        intel_market::create_seller_profile(&clk, scenario.ctx());

        // List + seal
        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"encrypted", scenario.ctx());
        ts::return_shared(listing);

        // Buyer purchases
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        assert!(intel_market::listing_status(&listing) == 1); // SOLD
        ts::return_shared(listing);

        // Buyer confirms + rates
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 4, &clk, scenario.ctx());
        assert!(intel_market::profile_total_trades(&profile) == 1);
        assert!(intel_market::profile_total_score(&profile) == 4);
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_auto_release() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 200_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Advance 25h
        clock::set_for_testing(&mut clk, 1000 + 90_000_000);

        // Outsider triggers auto-release
        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_release(&mut listing, &mut profile, &clk, scenario.ctx());
        assert!(intel_market::profile_total_trades(&profile) == 1);
        assert!(intel_market::profile_total_score(&profile) == 3); // default
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_cancel_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::cancel_listing(&mut listing, scenario.ctx());
        assert!(intel_market::listing_status(&listing) == 3); // CANCELLED
        ts::return_shared(listing);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::ESelfPurchase)]
    fun test_self_purchase_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());

        // Seller tries to buy own listing — should fail
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }
```

- [ ] **Step 2: Write bounty mode tests**

```move
    #[test]
    fun test_post_fulfill_accept() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Post request
        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Need threat intel Region 42",
            1, 42, b"Looking for hostile fleet positions",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Seller creates profile + fulfills
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"encrypted_intel", &clk, scenario.ctx());
        assert!(intel_market::request_status(&request) == 1); // REVIEWING
        assert!(intel_market::request_submission_count(&request) == 1);
        ts::return_shared(request);

        // Buyer accepts
        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::accept_and_rate(&mut request, &mut profile, SELLER, 5, &clk, scenario.ctx());
        assert!(intel_market::request_status(&request) == 2); // COMPLETED
        assert!(intel_market::profile_total_score(&profile) == 5);
        ts::return_shared(request);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_cancel_request_no_subs() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 86_400_000,
            &clk, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::cancel_request(&mut request, scenario.ctx());
        assert!(intel_market::request_status(&request) == 3); // CANCELLED
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EHasSubmissions)]
    fun test_cancel_request_with_subs_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 86_400_000,
            &clk, scenario.ctx(),
        );

        // Seller fulfills
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Buyer tries to cancel — should fail
        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::cancel_request(&mut request, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_auto_settle_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 200_000_000,
            &clk, scenario.ctx(),
        );

        // Seller fulfills
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Advance 25h
        clock::set_for_testing(&mut clk, 1000 + 90_000_000);

        // Outsider triggers auto-settle
        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_settle_request(
            &mut request, &mut profile, SELLER, &clk, scenario.ctx(),
        );
        assert!(intel_market::request_status(&request) == 2); // COMPLETED
        ts::return_shared(request);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd move/frontier_explorer_hub && sui move test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add move/frontier_explorer_hub/tests/intel_market_tests.move
git commit -m "test(move): add intel_market unit tests — sell mode, bounty mode, edge cases"
```

---

## Task 4: Frontend — Types, Constants, Seal SDK

**Files:**
- Modify: `next-monorepo/app/src/types/index.ts`
- Modify: `next-monorepo/app/src/lib/constants.ts`
- Install: `@aspect-build/seal-client` (or `@aspect-build/seal-sdk` — check npm)

- [ ] **Step 1: Install Seal SDK**

Run: `cd next-monorepo/app && npm install @aspect-build/seal-client`

If package not found, check: `npm search seal-client` or use the Seal SDK from Bounty Escrow's package.json.

Check Bounty Escrow's dependency:
```bash
cat ../../../Bounty_Escrow_Protocol/bounty_escrow_frontend/package.json | grep -i seal
```

Install whatever package they use.

- [ ] **Step 2: Add TypeScript types**

Append to `next-monorepo/app/src/types/index.ts`:

```typescript
// ═══════════════════════════════════════════════
// Intel Market v2
// ═══════════════════════════════════════════════

export interface PublicMeta {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  intelType: number;
  severity: number;
  expiry: number;
}

export interface IntelListingV2 {
  id: string;
  seller: string;
  title: string;
  publicMetadata: PublicMeta;
  priceMist: number;
  status: number; // 0=ACTIVE, 1=SOLD, 2=EXPIRED, 3=CANCELLED
  buyer: string | null;
  purchasedAt: number | null;
  createdAt: number;
  isSealed: boolean;
}

export interface IntelRequestV2 {
  id: string;
  buyer: string;
  title: string;
  intelType: number;
  regionId: number;
  description: string;
  rewardMist: number;
  deadline: number;
  status: number; // 0=OPEN, 1=REVIEWING, 2=COMPLETED, 3=CANCELLED, 4=EXPIRED
  firstSubmissionAt: number | null;
  submissionCount: number;
  selectedSeller: string | null;
  createdAt: number;
}

export interface IntelSubmissionV2 {
  seller: string;
  submittedAt: number;
}

export interface SellerProfile {
  id: string;
  seller: string;
  totalTrades: number;
  totalScore: number;
  totalWeightedScore: number;
  totalVolumeMist: number;
  createdAt: number;
}

// Listing status
export const LISTING_STATUS = {
  ACTIVE: 0,
  SOLD: 1,
  EXPIRED: 2,
  CANCELLED: 3,
} as const;

// Request status
export const REQUEST_STATUS = {
  OPEN: 0,
  REVIEWING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
} as const;
```

- [ ] **Step 3: Add constants**

Append to `next-monorepo/app/src/lib/constants.ts`:

```typescript
// ═══════════════════════════════════════════════
// Intel Market v2
// ═══════════════════════════════════════════════

export const MIN_LISTING_FEE_MIST = 10_000_000; // 0.01 SUI

export const AUTO_RELEASE_MS = 86_400_000; // 24h
export const REVIEW_TIMEOUT_MS = 86_400_000; // 24h

export const MIN_DEADLINE_MS = 3_600_000; // 1h
export const MAX_DEADLINE_MS = 604_800_000; // 7d

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATING_DEFAULT = 3;

export const LISTING_STATUS_LABELS: Record<number, string> = {
  0: "Active",
  1: "Sold",
  2: "Expired",
  3: "Cancelled",
};

export const REQUEST_STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Reviewing",
  2: "Completed",
  3: "Cancelled",
  4: "Expired",
};

export const EXPIRY_OPTIONS_V2 = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "6 hours", ms: 21_600_000 },
  { label: "24 hours", ms: 86_400_000 },
  { label: "3 days", ms: 259_200_000 },
  { label: "7 days", ms: 604_800_000 },
];

export const DEADLINE_OPTIONS = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "6 hours", ms: 21_600_000 },
  { label: "24 hours", ms: 86_400_000 },
  { label: "3 days", ms: 259_200_000 },
  { label: "7 days", ms: 604_800_000 },
];
```

- [ ] **Step 4: Commit**

```bash
git add next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/constants.ts next-monorepo/app/package.json next-monorepo/app/package-lock.json
git commit -m "feat: add intel market v2 types, constants, install Seal SDK"
```

---

## Task 5: Frontend — PTB Builders

**Files:**
- Create: `next-monorepo/app/src/lib/ptb/intel-market.ts`

- [ ] **Step 1: Write all PTB builder functions**

Reference existing pattern from `next-monorepo/app/src/lib/ptb/intel.ts` for argument style.

```typescript
import { Transaction } from "@mysten/sui/transactions";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;
const CLOCK_ID = "0x6";

// ═══════════════════════════════════════════════
// Sell Mode
// ═══════════════════════════════════════════════

export function buildListIntel(
  tx: Transaction,
  params: {
    title: string;
    regionId: number;
    sectorX: number;
    sectorY: number;
    sectorZ: number;
    intelType: number;
    severity: number;
    expiryMs: number;
    priceMist: number;
    feeMist: number;
  },
) {
  const [feeCoin] = tx.splitCoins(tx.gas, [params.feeMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::list_intel`,
    arguments: [
      tx.pure.vector("u8", new TextEncoder().encode(params.title)),
      tx.pure.u64(params.regionId),
      tx.pure.u64(params.sectorX),
      tx.pure.u64(params.sectorY),
      tx.pure.u64(params.sectorZ),
      tx.pure.u8(params.intelType),
      tx.pure.u8(params.severity),
      tx.pure.u64(params.expiryMs),
      tx.pure.u64(params.priceMist),
      feeCoin,
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildSetEncryptedPayload(
  tx: Transaction,
  params: { listingId: string; encryptedBytes: Uint8Array },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::set_encrypted_payload`,
    arguments: [
      tx.object(params.listingId),
      tx.pure.vector("u8", Array.from(params.encryptedBytes)),
    ],
  });
}

export function buildPurchaseIntel(
  tx: Transaction,
  params: { listingId: string; priceMist: number },
) {
  const [paymentCoin] = tx.splitCoins(tx.gas, [params.priceMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::purchase_intel`,
    arguments: [
      tx.object(params.listingId),
      paymentCoin,
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildConfirmAndRate(
  tx: Transaction,
  params: { listingId: string; profileId: string; rating: number },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::confirm_and_rate`,
    arguments: [
      tx.object(params.listingId),
      tx.object(params.profileId),
      tx.pure.u8(params.rating),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAutoRelease(
  tx: Transaction,
  params: { listingId: string; profileId: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::auto_release`,
    arguments: [
      tx.object(params.listingId),
      tx.object(params.profileId),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildCancelListing(
  tx: Transaction,
  params: { listingId: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::cancel_listing`,
    arguments: [tx.object(params.listingId)],
  });
}

// ═══════════════════════════════════════════════
// Bounty Mode
// ═══════════════════════════════════════════════

export function buildPostRequest(
  tx: Transaction,
  params: {
    title: string;
    intelType: number;
    regionId: number;
    description: string;
    rewardMist: number;
    deadlineMs: number;
  },
) {
  const [rewardCoin] = tx.splitCoins(tx.gas, [params.rewardMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::post_request`,
    arguments: [
      tx.pure.vector("u8", new TextEncoder().encode(params.title)),
      tx.pure.u8(params.intelType),
      tx.pure.u64(params.regionId),
      tx.pure.vector("u8", new TextEncoder().encode(params.description)),
      rewardCoin,
      tx.pure.u64(params.deadlineMs),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildFulfillRequest(
  tx: Transaction,
  params: { requestId: string; encryptedPayload: Uint8Array },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::fulfill_request`,
    arguments: [
      tx.object(params.requestId),
      tx.pure.vector("u8", Array.from(params.encryptedPayload)),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAcceptAndRate(
  tx: Transaction,
  params: {
    requestId: string;
    profileId: string;
    sellerAddr: string;
    rating: number;
  },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::accept_and_rate`,
    arguments: [
      tx.object(params.requestId),
      tx.object(params.profileId),
      tx.pure.address(params.sellerAddr),
      tx.pure.u8(params.rating),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAutoSettle(
  tx: Transaction,
  params: { requestId: string; profileId: string; firstSellerAddr: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::auto_settle_request`,
    arguments: [
      tx.object(params.requestId),
      tx.object(params.profileId),
      tx.pure.address(params.firstSellerAddr),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildCancelRequest(
  tx: Transaction,
  params: { requestId: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::cancel_request`,
    arguments: [tx.object(params.requestId)],
  });
}
```

- [ ] **Step 2: Run type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/lib/ptb/intel-market.ts
git commit -m "feat: add intel market v2 PTB builders"
```

---

## Task 6: Frontend — React Hooks

**Files:**
- Create: `next-monorepo/app/src/hooks/use-intel-market.ts`

- [ ] **Step 1: Write query and mutation hooks**

Follow the pattern from `next-monorepo/app/src/hooks/use-intel.ts` for sign+execute pattern.

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useUIStore } from "@/stores/ui-store";
import {
  buildListIntel,
  buildSetEncryptedPayload,
  buildPurchaseIntel,
  buildConfirmAndRate,
  buildAutoRelease,
  buildCancelListing,
  buildPostRequest,
  buildFulfillRequest,
  buildAcceptAndRate,
  buildAutoSettle,
  buildCancelRequest,
} from "@/lib/ptb/intel-market";
import type { IntelListingV2, IntelRequestV2, SellerProfile } from "@/types";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;

// ═══════════════════════════════════════════════
// Query hooks
// ═══════════════════════════════════════════════

export function useIntelListings() {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["intel-market", "listings"],
    queryFn: async () => {
      const objects = await client.getOwnedObjects({
        owner: "shared", // Needs indexer — use queryEvents or custom indexer
      });
      // TODO: Replace with indexer query for IntelListing objects
      // For now, use event-based approach:
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::ListingCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      return events.data;
    },
    refetchInterval: 30_000,
  });
}

export function useIntelRequests() {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["intel-market", "requests"],
    queryFn: async () => {
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::RequestCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      return events.data;
    },
    refetchInterval: 30_000,
  });
}

export function useSellerProfile(address: string | undefined) {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["intel-market", "profile", address],
    queryFn: async () => {
      if (!address) return null;
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: `${PACKAGE_ID}::intel_market::SellerProfile` },
      });
      if (objects.data.length === 0) return null;
      const obj = await client.getObject({
        id: objects.data[0].data!.objectId,
        options: { showContent: true },
      });
      return obj.data;
    },
    enabled: !!address,
  });
}

// ═══════════════════════════════════════════════
// Mutation hooks — Sell mode
// ═══════════════════════════════════════════════

function useSignExec() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  return { signAndExecute, addToast };
}

export function useListIntel() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildListIntel>[1]) => {
      const tx = new Transaction();
      buildListIntel(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel listed! Complete encryption next." });
    },
    onError: (e) => addToast({ type: "error", message: `List failed: ${e.message}` }),
  });
}

export function useSetEncryptedPayload() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildSetEncryptedPayload>[1]) => {
      const tx = new Transaction();
      buildSetEncryptedPayload(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel encrypted and sealed." });
    },
    onError: (e) => addToast({ type: "error", message: `Seal failed: ${e.message}` }),
  });
}

export function usePurchaseIntel() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildPurchaseIntel>[1]) => {
      const tx = new Transaction();
      buildPurchaseIntel(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel purchased! Decrypt to view." });
    },
    onError: (e) => addToast({ type: "error", message: `Purchase failed: ${e.message}` }),
  });
}

export function useConfirmAndRate() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildConfirmAndRate>[1]) => {
      const tx = new Transaction();
      buildConfirmAndRate(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Confirmed and rated. Payment released." });
    },
    onError: (e) => addToast({ type: "error", message: `Confirm failed: ${e.message}` }),
  });
}

// ═══════════════════════════════════════════════
// Mutation hooks — Bounty mode
// ═══════════════════════════════════════════════

export function usePostRequest() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildPostRequest>[1]) => {
      const tx = new Transaction();
      buildPostRequest(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Request posted. Reward locked." });
    },
    onError: (e) => addToast({ type: "error", message: `Post failed: ${e.message}` }),
  });
}

export function useFulfillRequest() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildFulfillRequest>[1]) => {
      const tx = new Transaction();
      buildFulfillRequest(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel submitted to bounty." });
    },
    onError: (e) => addToast({ type: "error", message: `Fulfill failed: ${e.message}` }),
  });
}

export function useAcceptAndRate() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildAcceptAndRate>[1]) => {
      const tx = new Transaction();
      buildAcceptAndRate(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Accepted and rated. Reward released." });
    },
    onError: (e) => addToast({ type: "error", message: `Accept failed: ${e.message}` }),
  });
}

export function useCancelListing() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildCancelListing>[1]) => {
      const tx = new Transaction();
      buildCancelListing(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Listing cancelled." });
    },
    onError: (e) => addToast({ type: "error", message: `Cancel failed: ${e.message}` }),
  });
}

export function useCancelRequest() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildCancelRequest>[1]) => {
      const tx = new Transaction();
      buildCancelRequest(tx, params);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Request cancelled. Reward refunded." });
    },
    onError: (e) => addToast({ type: "error", message: `Cancel failed: ${e.message}` }),
  });
}
```

- [ ] **Step 2: Run type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/hooks/use-intel-market.ts
git commit -m "feat: add intel market v2 React hooks"
```

---

## Task 7: Frontend — Sell Intel Tab Components

**Files:**
- Create: `next-monorepo/app/src/components/intel-market/IntelListingCard.tsx`
- Create: `next-monorepo/app/src/components/intel-market/IntelListingBrowser.tsx`
- Create: `next-monorepo/app/src/components/intel-market/NewListingForm.tsx`
- Create: `next-monorepo/app/src/components/intel-market/RatingStars.tsx`
- Create: `next-monorepo/app/src/components/intel-market/CountdownTimer.tsx`

- [ ] **Step 1: Create shared UI components (RatingStars + CountdownTimer)**

`RatingStars.tsx`:
```tsx
"use client";

interface RatingStarsProps {
  rating: number; // 0-5
  trades: number;
  size?: "sm" | "md";
}

export function RatingStars({ rating, trades, size = "sm" }: RatingStarsProps) {
  const display = trades === 0 ? 3.0 : rating;
  const textSize = size === "sm" ? "text-[0.6rem]" : "text-xs";
  return (
    <span className={`${textSize} text-eve-muted`}>
      ★ {display.toFixed(1)} ({trades} trade{trades !== 1 ? "s" : ""})
    </span>
  );
}
```

`CountdownTimer.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetMs: number;
  label?: string;
}

export function CountdownTimer({ targetMs, label }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(targetMs - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(targetMs - Date.now());
    }, 60_000);
    return () => clearInterval(interval);
  }, [targetMs]);

  if (remaining <= 0) {
    return (
      <span className="text-[0.6rem] text-eve-danger animate-pulse-dot">
        {label ?? "EXPIRED"}
      </span>
    );
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  let color = "text-eve-muted";
  let anim = "";
  if (remaining < 3_600_000) {
    color = "text-eve-danger";
    anim = "animate-pulse-dot";
  } else if (remaining < 43_200_000) {
    color = "text-eve-warn";
  }

  const text =
    hours > 0 ? `⏱ ${hours}h ${minutes}m left` : `⏱ ${minutes}m left`;

  return <span className={`text-[0.6rem] ${color} ${anim}`}>{text}</span>;
}
```

- [ ] **Step 2: Create IntelListingCard**

```tsx
"use client";

import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { RatingStars } from "./RatingStars";
import { CountdownTimer } from "./CountdownTimer";
import type { IntelListingV2 } from "@/types";

const TYPE_COLORS: Record<number, string> = {
  0: "text-eve-safe",    // Resource
  1: "text-eve-danger",  // Threat
  2: "text-eve-warn",    // Wreckage
  3: "text-eve-info",    // Population
};

const TYPE_ICONS: Record<number, string> = {
  0: "◆", 1: "⚠", 2: "▣", 3: "●",
};

interface Props {
  listing: IntelListingV2;
  sellerRating: number;
  sellerTrades: number;
  onBuy?: () => void;
}

export function IntelListingCard({ listing, sellerRating, sellerTrades, onBuy }: Props) {
  const meta = listing.publicMetadata;
  const typeColor = TYPE_COLORS[meta.intelType] ?? "text-eve-muted";
  const icon = TYPE_ICONS[meta.intelType] ?? "?";

  return (
    <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2 cursor-pointer hover:border-eve-panel-border/60">
      <div className="flex justify-between items-center">
        <span className={`${typeColor} text-[0.63rem]`}>
          {icon} {INTEL_TYPE_LABELS[meta.intelType]}
        </span>
        <span className="text-eve-gold text-[0.63rem] font-bold">
          {(listing.priceMist / 1_000_000_000).toFixed(2)} SUI
        </span>
      </div>
      <div className="text-[0.7rem] text-eve-text mt-1 truncate">{listing.title}</div>
      <div className="text-[0.6rem] text-eve-muted mt-0.5">
        Region {meta.regionId} · Sector ({meta.sectorX}, {meta.sectorY}, {meta.sectorZ}) · Severity {meta.severity}/10
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <div className="flex items-center gap-2">
          <RatingStars rating={sellerRating} trades={sellerTrades} />
          <CountdownTimer targetMs={meta.expiry} />
        </div>
        {listing.status === 0 && listing.isSealed && onBuy && (
          <button
            onClick={(e) => { e.stopPropagation(); onBuy(); }}
            className="text-[0.6rem] border border-eve-gold/40 text-eve-gold px-1.5 py-0.5 hover:bg-eve-gold/10"
          >
            BUY
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create IntelListingBrowser (left panel)**

```tsx
"use client";

import { useState, useMemo } from "react";
import { useIntelListings } from "@/hooks/use-intel-market";
import { IntelListingCard } from "./IntelListingCard";
import { INTEL_TYPE_LABELS } from "@/lib/constants";

const SORT_OPTIONS = [
  { label: "Newest", key: "newest" },
  { label: "Price ↑", key: "price_asc" },
  { label: "Price ↓", key: "price_desc" },
  { label: "Rating", key: "rating" },
] as const;

export function IntelListingBrowser({ onBuy }: { onBuy?: (listingId: string) => void }) {
  const { data: listings, isLoading } = useIntelListings();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("newest");

  // Filtering and sorting would happen here once data model is connected
  // For now, render event-based data

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">Browse Intel</div>

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 Search by title, region, keyword..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5 mb-2"
      />

      {/* Filters + Sort */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-[0.6rem] border px-1.5 py-0.5 ${
              typeFilter === null
                ? "border-eve-gold/40 text-eve-gold bg-eve-gold/5"
                : "border-eve-panel-border text-eve-muted"
            }`}
          >
            All
          </button>
          {Object.entries(INTEL_TYPE_LABELS).map(([k, label]) => {
            const colors = ["text-eve-safe", "text-eve-danger", "text-eve-warn", "text-eve-info"];
            return (
              <button
                key={k}
                onClick={() => setTypeFilter(Number(k))}
                className={`text-[0.6rem] border px-1.5 py-0.5 ${
                  typeFilter === Number(k)
                    ? "border-eve-gold/40 bg-eve-gold/5"
                    : "border-eve-panel-border"
                } ${colors[Number(k)]}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-[0.6rem] bg-transparent border border-eve-panel-border text-eve-muted px-1 py-0.5"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Listing cards */}
      <div className="flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {isLoading && <div className="text-xs text-eve-muted p-4">Loading...</div>}
        {/* Placeholder — replace with actual data mapping */}
        <div className="text-xs text-eve-muted p-4 text-center">
          No listings yet. Be the first to sell intel.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create NewListingForm (right panel)**

```tsx
"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useListIntel, useSetEncryptedPayload } from "@/hooks/use-intel-market";
import { INTEL_TYPE_LABELS, EXPIRY_OPTIONS_V2, MIN_LISTING_FEE_MIST } from "@/lib/constants";

export function NewListingForm() {
  const account = useCurrentAccount();
  const listIntel = useListIntel();
  const sealPayload = useSetEncryptedPayload();

  const [title, setTitle] = useState("");
  const [regionId, setRegionId] = useState(0);
  const [sectorX, setSectorX] = useState(0);
  const [sectorY, setSectorY] = useState(0);
  const [sectorZ, setSectorZ] = useState(0);
  const [intelType, setIntelType] = useState(0);
  const [severity, setSeverity] = useState(5);
  const [expiryOffset, setExpiryOffset] = useState(EXPIRY_OPTIONS_V2[2].ms);
  const [priceSui, setPriceSui] = useState("");

  // Encrypted layer
  const [exactX, setExactX] = useState("");
  const [exactY, setExactY] = useState("");
  const [exactZ, setExactZ] = useState("");
  const [description, setDescription] = useState("");

  const [listingId, setListingId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const handleStep1 = async () => {
    if (!account) return;
    const priceMist = Math.floor(parseFloat(priceSui) * 1_000_000_000);
    const result = await listIntel.mutateAsync({
      title,
      regionId,
      sectorX,
      sectorY,
      sectorZ,
      intelType,
      severity,
      expiryMs: Date.now() + expiryOffset,
      priceMist,
      feeMist: MIN_LISTING_FEE_MIST,
    });
    // Extract listing ID from TX result events
    // TODO: parse result.events to find ListingCreatedEvent → listing_id
    setStep(2);
  };

  const handleStep2 = async () => {
    if (!listingId) return;
    const plaintext = JSON.stringify({
      exactCoords: { x: exactX, y: exactY, z: exactZ },
      description,
    });
    // TODO: Seal encrypt plaintext with listingId as namespace
    // const encrypted = await sealEncrypt(listingId, plaintext);
    const encrypted = new TextEncoder().encode(plaintext); // placeholder
    await sealPayload.mutateAsync({
      listingId,
      encryptedBytes: encrypted,
    });
  };

  const isPending = listIntel.isPending || sealPayload.isPending;
  const inputClass = "w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5";

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel sticky top-4">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">
        New Listing {step === 2 && "— Step 2: Encrypt"}
      </div>

      {step === 1 && (
        <>
          {/* Title */}
          <input
            type="text"
            placeholder='Title: "High-value wreckage field..."'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} mb-2`}
            maxLength={256}
          />

          {/* Public layer */}
          <div className="border border-eve-panel-border/40 p-2 mb-2">
            <div className="text-[0.6rem] text-eve-cold mb-1.5">▸ PUBLIC (visible to all)</div>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="number" placeholder="Region ID" value={regionId || ""} onChange={(e) => setRegionId(Number(e.target.value))} className={inputClass} />
              <select value={intelType} onChange={(e) => setIntelType(Number(e.target.value))} className={inputClass}>
                {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              <input type="number" placeholder="Sector X" value={sectorX || ""} onChange={(e) => setSectorX(Number(e.target.value))} className={inputClass} />
              <input type="number" placeholder="Sector Y" value={sectorY || ""} onChange={(e) => setSectorY(Number(e.target.value))} className={inputClass} />
              <input type="number" placeholder="Sector Z" value={sectorZ || ""} onChange={(e) => setSectorZ(Number(e.target.value))} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <div>
                <label className="text-[0.55rem] text-eve-muted">Severity: {severity}/10</label>
                <input type="range" min={0} max={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="w-full" />
              </div>
              <select value={expiryOffset} onChange={(e) => setExpiryOffset(Number(e.target.value))} className={inputClass}>
                {EXPIRY_OPTIONS_V2.map((o) => <option key={o.ms} value={o.ms}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Encrypted layer */}
          <div className="border border-eve-gold/20 p-2 mb-2">
            <div className="text-[0.6rem] text-eve-gold mb-1.5">🔒 ENCRYPTED (buyers only)</div>
            <div className="grid grid-cols-3 gap-1.5">
              <input type="text" placeholder="Exact X" value={exactX} onChange={(e) => setExactX(e.target.value)} className={`${inputClass} border-eve-gold/20`} />
              <input type="text" placeholder="Exact Y" value={exactY} onChange={(e) => setExactY(e.target.value)} className={`${inputClass} border-eve-gold/20`} />
              <input type="text" placeholder="Exact Z" value={exactZ} onChange={(e) => setExactZ(e.target.value)} className={`${inputClass} border-eve-gold/20`} />
            </div>
            <textarea
              placeholder="Detailed intel description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} border-eve-gold/20 mt-1.5 min-h-[60px] resize-none`}
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <input type="number" placeholder="Price (SUI)" step="0.01" value={priceSui} onChange={(e) => setPriceSui(e.target.value)} className={`${inputClass} text-eve-gold`} />
            <div className={`${inputClass} text-eve-muted`}>Fee: 0.01 SUI</div>
          </div>

          <button
            onClick={handleStep1}
            disabled={!account || isPending || !title || !priceSui}
            className="w-full border border-eve-gold/40 text-eve-gold py-1.5 text-xs hover:bg-eve-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Submitting..." : "⬆ LIST INTEL (Step 1/2)"}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="text-xs text-eve-muted mb-3">
            Listing created. Now encrypt the private details with Seal protocol.
          </div>
          <button
            onClick={handleStep2}
            disabled={isPending}
            className="w-full border border-eve-gold/40 text-eve-gold py-1.5 text-xs hover:bg-eve-gold/10 disabled:opacity-40"
          >
            {isPending ? "Encrypting..." : "🔒 ENCRYPT & SEAL (Step 2/2)"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/components/intel-market/
git commit -m "feat: add Sell Intel tab components — listing browser, form, rating, countdown"
```

---

## Task 8: Frontend — Bounty Board Tab Components

**Files:**
- Create: `next-monorepo/app/src/components/intel-market/IntelRequestCard.tsx`
- Create: `next-monorepo/app/src/components/intel-market/IntelRequestBrowser.tsx`
- Create: `next-monorepo/app/src/components/intel-market/PostRequestForm.tsx`

- [ ] **Step 1: Create IntelRequestCard**

```tsx
"use client";

import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { RatingStars } from "./RatingStars";
import { CountdownTimer } from "./CountdownTimer";
import { AUTO_RELEASE_MS } from "@/lib/constants";
import type { IntelRequestV2 } from "@/types";

const TYPE_COLORS: Record<number, string> = {
  0: "text-eve-safe", 1: "text-eve-danger", 2: "text-eve-warn", 3: "text-eve-info",
};
const TYPE_ICONS: Record<number, string> = {
  0: "◆", 1: "⚠", 2: "▣", 3: "●",
};

interface Props {
  request: IntelRequestV2;
  buyerRating?: number;
  buyerTrades?: number;
  onFulfill?: () => void;
}

export function IntelRequestCard({ request, buyerRating, buyerTrades, onFulfill }: Props) {
  const typeColor = TYPE_COLORS[request.intelType] ?? "text-eve-muted";
  const icon = TYPE_ICONS[request.intelType] ?? "?";
  const isReviewing = request.status === 1;
  const reviewDeadline = request.firstSubmissionAt
    ? request.firstSubmissionAt + AUTO_RELEASE_MS
    : null;

  return (
    <div className={`border p-2 cursor-pointer ${
      isReviewing
        ? "border-eve-gold/30 bg-[rgba(228,180,128,0.03)]"
        : "border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)]"
    } hover:border-eve-panel-border/60`}>
      <div className="flex justify-between items-center">
        <span className={`${typeColor} text-[0.63rem]`}>
          {icon} {INTEL_TYPE_LABELS[request.intelType]}
        </span>
        <span className="text-eve-safe text-[0.7rem] font-bold">
          {(request.rewardMist / 1_000_000_000).toFixed(2)} SUI
        </span>
      </div>
      <div className="text-[0.7rem] text-eve-text mt-1 truncate">{request.title}</div>
      <div className="text-[0.6rem] text-eve-muted mt-0.5">
        Region: {request.regionId} · Posted {new Date(request.createdAt).toLocaleString()}
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <div className="flex items-center gap-2">
          {buyerRating !== undefined && (
            <span className="text-[0.6rem] text-eve-muted">Buyer: </span>
          )}
          {buyerRating !== undefined && buyerTrades !== undefined && (
            <RatingStars rating={buyerRating} trades={buyerTrades} />
          )}
          <span className={`text-[0.6rem] ${request.submissionCount > 0 ? "text-eve-warn" : "text-eve-muted/50"}`}>
            {request.submissionCount} submission{request.submissionCount !== 1 ? "s" : ""}
          </span>
          {reviewDeadline && <CountdownTimer targetMs={reviewDeadline} />}
        </div>
        {request.status === 0 && onFulfill && (
          <button
            onClick={(e) => { e.stopPropagation(); onFulfill(); }}
            className="text-[0.6rem] border border-eve-cold/40 text-eve-cold px-1.5 py-0.5 hover:bg-eve-cold/10"
          >
            FULFILL
          </button>
        )}
        {request.status === 1 && request.submissionCount > 0 && !onFulfill && (
          <span className="text-[0.6rem] border border-eve-panel-border/30 text-eve-muted/40 px-1.5 py-0.5">
            REVIEWING
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create IntelRequestBrowser (left panel)**

Follow same pattern as `IntelListingBrowser` from Task 7 Step 3, but:
- Query key: `useIntelRequests()`
- Sort options: Reward ↓, Newest, Deadline
- Cards: `IntelRequestCard`

```tsx
"use client";

import { useState } from "react";
import { useIntelRequests } from "@/hooks/use-intel-market";
import { INTEL_TYPE_LABELS } from "@/lib/constants";

const SORT_OPTIONS = [
  { label: "Reward ↓", key: "reward_desc" },
  { label: "Newest", key: "newest" },
  { label: "Deadline", key: "deadline" },
] as const;

export function IntelRequestBrowser({ onFulfill }: { onFulfill?: (requestId: string) => void }) {
  const { data: requests, isLoading } = useIntelRequests();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("reward_desc");

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">Open Requests</div>

      <input
        type="text"
        placeholder="🔍 Search by title, region, keyword..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5 mb-2"
      />

      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-[0.6rem] border px-1.5 py-0.5 ${
              typeFilter === null ? "border-eve-gold/40 text-eve-gold bg-eve-gold/5" : "border-eve-panel-border text-eve-muted"
            }`}
          >All</button>
          {Object.entries(INTEL_TYPE_LABELS).map(([k, label]) => {
            const colors = ["text-eve-safe", "text-eve-danger", "text-eve-warn", "text-eve-info"];
            return (
              <button key={k} onClick={() => setTypeFilter(Number(k))}
                className={`text-[0.6rem] border px-1.5 py-0.5 ${typeFilter === Number(k) ? "border-eve-gold/40 bg-eve-gold/5" : "border-eve-panel-border"} ${colors[Number(k)]}`}
              >{label}</button>
            );
          })}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="text-[0.6rem] bg-transparent border border-eve-panel-border text-eve-muted px-1 py-0.5"
        >
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {isLoading && <div className="text-xs text-eve-muted p-4">Loading...</div>}
        <div className="text-xs text-eve-muted p-4 text-center">
          No open requests. Post one to get started.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PostRequestForm (right panel)**

```tsx
"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { usePostRequest } from "@/hooks/use-intel-market";
import { INTEL_TYPE_LABELS, DEADLINE_OPTIONS } from "@/lib/constants";

export function PostRequestForm() {
  const account = useCurrentAccount();
  const postRequest = usePostRequest();

  const [title, setTitle] = useState("");
  const [intelType, setIntelType] = useState(0);
  const [regionId, setRegionId] = useState(0);
  const [description, setDescription] = useState("");
  const [rewardSui, setRewardSui] = useState("");
  const [deadlineOffset, setDeadlineOffset] = useState(DEADLINE_OPTIONS[2].ms);

  const handleSubmit = async () => {
    if (!account) return;
    const rewardMist = Math.floor(parseFloat(rewardSui) * 1_000_000_000);
    await postRequest.mutateAsync({
      title,
      intelType,
      regionId,
      description,
      rewardMist,
      deadlineMs: Date.now() + deadlineOffset,
    });
    // Reset form
    setTitle("");
    setDescription("");
    setRewardSui("");
  };

  const inputClass = "w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5";

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel sticky top-4">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">Post New Request</div>

      <input type="text" placeholder='Title: "Need threat intel for..."' value={title}
        onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mb-1.5`} maxLength={256} />

      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <select value={intelType} onChange={(e) => setIntelType(Number(e.target.value))} className={inputClass}>
          {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" placeholder="Region ID" value={regionId || ""} onChange={(e) => setRegionId(Number(e.target.value))} className={inputClass} />
      </div>

      <textarea placeholder="Description: what intel you need..."
        value={description} onChange={(e) => setDescription(e.target.value)}
        className={`${inputClass} mb-1.5 min-h-[60px] resize-none`} maxLength={1024} />

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <input type="number" placeholder="Reward (SUI)" step="0.01" value={rewardSui}
          onChange={(e) => setRewardSui(e.target.value)} className={`${inputClass} text-eve-safe`} />
        <select value={deadlineOffset} onChange={(e) => setDeadlineOffset(Number(e.target.value))} className={inputClass}>
          {DEADLINE_OPTIONS.map((o) => <option key={o.ms} value={o.ms}>{o.label}</option>)}
        </select>
      </div>

      <button onClick={handleSubmit}
        disabled={!account || postRequest.isPending || !title || !rewardSui}
        className="w-full border border-eve-cold/40 text-eve-cold py-1.5 text-xs hover:bg-eve-cold/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {postRequest.isPending ? "Posting..." : "📡 POST REQUEST (LOCK REWARD)"}
      </button>

      <div className="border-t border-eve-panel-border/20 mt-3 pt-2">
        <div className="text-[0.6rem] text-eve-muted/50 leading-relaxed">
          ▸ Click a request to view submissions<br />
          ▸ First submission starts 24h countdown<br />
          ▸ Pick best → confirm & rate → auto-release
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/components/intel-market/
git commit -m "feat: add Bounty Board tab components — request browser, form, card"
```

---

## Task 9: Frontend — My Activity Tab

**Files:**
- Create: `next-monorepo/app/src/components/intel-market/MyActivity.tsx`

- [ ] **Step 1: Create MyActivity component with 4 accordion sections**

```tsx
"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

type Section = "listings" | "purchases" | "requests" | "submissions";

export function MyActivity() {
  const account = useCurrentAccount();
  const [expanded, setExpanded] = useState<Set<Section>>(new Set(["listings", "purchases"]));

  const toggle = (s: Section) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  if (!account) {
    return (
      <div className="border border-eve-panel-border p-6 bg-eve-panel text-center">
        <div className="text-xs text-eve-muted">Connect wallet to view activity</div>
      </div>
    );
  }

  const sectionClass = "border border-eve-panel-border bg-eve-panel mb-2";
  const headerClass = "flex justify-between items-center p-3 cursor-pointer hover:bg-[rgba(16,22,31,0.5)]";
  const titleClass = "text-xs tracking-wide uppercase text-eve-cold";

  return (
    <div>
      {/* MY LISTINGS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("listings")}>
          <span className={titleClass}>My Listings</span>
          <span className="text-eve-muted text-xs">{expanded.has("listings") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("listings") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No listings yet
            </div>
          </div>
        )}
      </div>

      {/* MY PURCHASES */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("purchases")}>
          <span className={titleClass}>My Purchases</span>
          <span className="text-eve-muted text-xs">{expanded.has("purchases") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("purchases") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No purchases yet
            </div>
          </div>
        )}
      </div>

      {/* MY REQUESTS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("requests")}>
          <span className={titleClass}>My Requests</span>
          <span className="text-eve-muted text-xs">{expanded.has("requests") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("requests") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No requests yet
            </div>
          </div>
        )}
      </div>

      {/* MY SUBMISSIONS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("submissions")}>
          <span className={titleClass}>My Submissions</span>
          <span className="text-eve-muted text-xs">{expanded.has("submissions") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("submissions") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No submissions yet
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/components/intel-market/MyActivity.tsx
git commit -m "feat: add My Activity tab with 4 accordion sections"
```

---

## Task 10: Frontend — Page Assembly + Sidebar + Routing

**Files:**
- Create: `next-monorepo/app/src/app/intel-market/page.tsx`
- Modify: `next-monorepo/app/src/components/Sidebar.tsx` (line ~12: change "/submit" → "/intel-market", label → "Intel Market")
- Delete: `next-monorepo/app/src/app/submit/page.tsx` (or keep as redirect)

- [ ] **Step 1: Create the Intel Market page**

```tsx
"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { IntelListingBrowser } from "@/components/intel-market/IntelListingBrowser";
import { NewListingForm } from "@/components/intel-market/NewListingForm";
import { IntelRequestBrowser } from "@/components/intel-market/IntelRequestBrowser";
import { PostRequestForm } from "@/components/intel-market/PostRequestForm";
import { MyActivity } from "@/components/intel-market/MyActivity";

type Tab = "sell" | "bounty" | "activity";

export default function IntelMarketPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sell");

  const tabs: { key: Tab; label: string }[] = [
    { key: "sell", label: "SELL INTEL" },
    { key: "bounty", label: "BOUNTY BOARD" },
    { key: "activity", label: "MY ACTIVITY" },
  ];

  return (
    <div className="max-w-[1300px] mx-auto p-4">
      <PageHeader
        title="INTEL MARKET"
        subtitle="Trade encrypted intelligence. Buy verified intel. Build your reputation."
      />

      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-eve-panel-border mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-xs font-mono tracking-wide transition-colors ${
              activeTab === tab.key
                ? "text-eve-gold border-b-2 border-eve-gold -mb-[1px]"
                : "text-eve-muted hover:text-eve-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "sell" && (
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
          <IntelListingBrowser />
          <div className="content-start sticky top-4">
            <NewListingForm />
          </div>
        </div>
      )}

      {activeTab === "bounty" && (
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
          <IntelRequestBrowser />
          <div className="content-start sticky top-4">
            <PostRequestForm />
          </div>
        </div>
      )}

      {activeTab === "activity" && <MyActivity />}
    </div>
  );
}
```

- [ ] **Step 2: Update Sidebar nav item**

In `next-monorepo/app/src/components/Sidebar.tsx`, change the nav item from:
```typescript
{ href: "/submit", label: "Submit Intel", ... }
```
to:
```typescript
{ href: "/intel-market", label: "Intel Market", ... }
```

- [ ] **Step 3: Add redirect from old `/submit` route**

Replace `next-monorepo/app/src/app/submit/page.tsx` content with a redirect:

```tsx
import { redirect } from "next/navigation";
export default function SubmitRedirect() {
  redirect("/intel-market");
}
```

- [ ] **Step 4: Run type check + dev server**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Run: `cd next-monorepo/app && npm run dev` (verify page loads at `/intel-market`)

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/app/intel-market/ next-monorepo/app/src/components/Sidebar.tsx next-monorepo/app/src/app/submit/page.tsx
git commit -m "feat: assemble Intel Market page with 3 tabs, update sidebar routing"
```

---

## Task 11: Move Tests — Monkey Testing (Extreme Edge Cases)

**Files:**
- Modify: `move/frontier_explorer_hub/tests/intel_market_tests.move`

- [ ] **Step 1: Add edge case tests**

```move
    // ═══════════════════════════════════════════════
    // Monkey / Edge Case Tests
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = intel_market::ETitleTooLong)]
    fun test_title_257_chars_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // 257 bytes title
        let mut title = vector[];
        let mut i = 0;
        while (i < 257) { title.push_back(0x41); i = i + 1; };

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(title, 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInvalidRating)]
    fun test_rating_zero_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let pay = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, pay, &clk, scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 0, &clk, scenario.ctx()); // rating=0 invalid

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInvalidRating)]
    fun test_rating_six_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let pay = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, pay, &clk, scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 6, &clk, scenario.ctx()); // rating=6 invalid

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EAutoReleaseNotReady)]
    fun test_auto_release_too_early_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 200_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let pay = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, pay, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Only 1h later (not 24h)
        clock::set_for_testing(&mut clk, 1000 + 3_600_000);

        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_release(&mut listing, &mut profile, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EPayloadEmpty)]
    fun test_empty_payload_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, vector[], scenario.ctx()); // empty!

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EAlreadySubmitted)]
    fun test_double_submit_bounty_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(b"T", 0, 1, b"d", reward, 1000 + 86_400_000, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc1", &clk, scenario.ctx());
        ts::return_shared(request);

        // Same seller tries again
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc2", &clk, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }
```

- [ ] **Step 2: Run all tests**

Run: `cd move/frontier_explorer_hub && sui move test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add move/frontier_explorer_hub/tests/intel_market_tests.move
git commit -m "test(move): add monkey tests — edge cases for intel_market"
```

---

## Summary

| Task | Scope | Files |
|------|-------|-------|
| 1 | Move: sell mode structs + functions | `intel_market.move` |
| 2 | Move: bounty mode + requests | `intel_market.move` |
| 3 | Move: unit tests (happy paths) | `intel_market_tests.move` |
| 4 | Frontend: types, constants, Seal SDK | `types/`, `constants.ts` |
| 5 | Frontend: PTB builders | `ptb/intel-market.ts` |
| 6 | Frontend: React hooks | `hooks/use-intel-market.ts` |
| 7 | Frontend: Sell Intel tab | `components/intel-market/*` |
| 8 | Frontend: Bounty Board tab | `components/intel-market/*` |
| 9 | Frontend: My Activity tab | `MyActivity.tsx` |
| 10 | Frontend: page assembly + routing | `intel-market/page.tsx`, `Sidebar.tsx` |
| 11 | Move: monkey tests | `intel_market_tests.move` |

**Dependencies:** Task 1 → 2 → 3 (Move sequential). Task 4 → 5 → 6 → 7/8/9 → 10 (Frontend sequential). Task 11 depends on Task 2.

**Future enhancements (not in scope):**
- Platform fee (`MarketConfig` + `AdminCap` + treasury)
- Seal SDK full integration (currently placeholder encrypt/decrypt)
- Indexer for efficient querying (currently event-based)
- Weighted rating display in frontend
- My Activity data population (requires indexer)
