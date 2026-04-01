#[allow(unused_const)]
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

    // Error codes (320 series — bounty mode)
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

    // ═══════════════════════════════════════════════
    // Structs — Sell Mode
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
    // Structs — Bounty Mode
    // ═══════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════
    // Events — Sell Mode
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

    // ═══════════════════════════════════════════════
    // Events — Bounty Mode
    // ═══════════════════════════════════════════════

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

    public fun confirm_and_rate(
        listing: &mut IntelListing,
        profile: &mut SellerProfile,
        rating: u8,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(listing.status == LISTING_SOLD, EListingNotSold);
        assert!(listing.buyer == option::some(ctx.sender()), ENotBuyer);
        assert!(rating >= MIN_RATING && rating <= MAX_RATING, EInvalidRating);
        assert!(profile.seller == listing.seller, ENotSeller);

        let price = listing.payment.value();

        // Release payment to seller
        let pay_amt = listing.payment.value();
        let payment_coin = coin::from_balance(listing.payment.split(pay_amt), ctx);
        transfer::public_transfer(payment_coin, listing.seller);

        // Refund listing fee to seller
        let fee_amt = listing.listing_fee.value();
        let fee_coin = coin::from_balance(listing.listing_fee.split(fee_amt), ctx);
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
        let pay_amt = listing.payment.value();
        let payment_coin = coin::from_balance(listing.payment.split(pay_amt), ctx);
        transfer::public_transfer(payment_coin, listing.seller);

        // Refund listing fee
        let fee_amt = listing.listing_fee.value();
        let fee_coin = coin::from_balance(listing.listing_fee.split(fee_amt), ctx);
        transfer::public_transfer(fee_coin, listing.seller);

        // Default rating
        update_profile(profile, DEFAULT_RATING, price);

        event::emit(AutoReleasedEvent {
            listing_id: object::id(listing),
            seller: listing.seller,
            price_mist: price,
        });
    }

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

    public fun accept_and_rate(
        request: &mut IntelRequest,
        profile: &mut SellerProfile,
        seller_addr: address,
        rating: u8,
        _clock: &Clock,
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
        let rwd_amt = request.reward.value();
        let reward_coin = coin::from_balance(request.reward.split(rwd_amt), ctx);
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

        let reward_coin = coin::from_balance(request.reward.split(reward_amount), ctx);
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
        let rwd_amt = request.reward.value();
        let reward_coin = coin::from_balance(request.reward.split(rwd_amt), ctx);
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

        let rwd_amt = request.reward.value();
        let reward_coin = coin::from_balance(request.reward.split(rwd_amt), ctx);
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
}
