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
