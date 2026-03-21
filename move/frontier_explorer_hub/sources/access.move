module frontier_explorer_hub::access {
    use sui::coin::Coin;
    use sui::balance;
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;
    use sui::vec_map::{Self, VecMap};

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::subscription;

    // ═══════════════════════════════════════════════
    // Error codes (mirrored from admin for abort origin)
    // ═══════════════════════════════════════════════

    const EInsufficientPayment: u64 = 6;
    const EShareBelowMinimum: u64 = 11;
    const EShareAboveMaximum: u64 = 12;
    const ESlippageExceeded: u64 = 13;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct UnlockReceipt has key, store {
        id: UID,
        original_buyer: address,
        intel_id: ID,
        unlocked_at: u64,
        price_paid: u64,
    }

    public struct PricingTable has key {
        id: UID,
        base_unlock_price: u64,
        type_multipliers: VecMap<u8, u64>,
        reporter_share_bps: u64,
    }

    public struct IntelUnlockedEvent has copy, drop {
        receipt_id: ID,
        buyer: address,
        intel_id: ID,
        price_paid: u64,
        reporter_share: u64,
    }

    // ═══════════════════════════════════════════════
    // Admin functions
    // ═══════════════════════════════════════════════

    public fun create_pricing_table(
        _admin: &admin::AdminCap,
        ctx: &mut TxContext,
    ) {
        let table = PricingTable {
            id: object::new(ctx),
            base_unlock_price: admin::default_base_unlock_price(),
            type_multipliers: vec_map::empty(),
            reporter_share_bps: admin::default_reporter_share_bps(),
        };
        transfer::share_object(table);
    }

    public fun set_pricing(
        _admin: &admin::AdminCap,
        pricing: &mut PricingTable,
        new_base_price: u64,
    ) {
        pricing.base_unlock_price = new_base_price;
    }

    public fun set_reporter_share(
        _admin: &admin::AdminCap,
        pricing: &mut PricingTable,
        bps: u64,
    ) {
        assert!(bps >= admin::min_reporter_share_bps(), EShareBelowMinimum);
        assert!(bps <= admin::max_reporter_share_bps(), EShareAboveMaximum);
        pricing.reporter_share_bps = bps;
    }

    public fun set_type_multiplier(
        _admin: &admin::AdminCap,
        pricing: &mut PricingTable,
        intel_type: u8,
        multiplier: u64,
    ) {
        if (pricing.type_multipliers.contains(&intel_type)) {
            pricing.type_multipliers.remove(&intel_type);
        };
        pricing.type_multipliers.insert(intel_type, multiplier);
    }

    // ═══════════════════════════════════════════════
    // Core functions
    // ═══════════════════════════════════════════════

    public fun unlock_intel(
        pricing: &PricingTable,
        config: &mut subscription::SubscriptionConfig,
        intel: &intel::IntelReport,
        payment: &mut Coin<SUI>,
        max_price: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // 1. Calculate price
        let itype = intel.intel_type();
        let multiplier = if (pricing.type_multipliers.contains(&itype)) {
            *pricing.type_multipliers.get(&itype)
        } else {
            100
        };
        let price = pricing.base_unlock_price * multiplier / 100;

        // 2. Slippage protection
        assert!(max_price >= price, ESlippageExceeded);

        // 3. Sufficient payment
        assert!(payment.value() >= price, EInsufficientPayment);

        // 4. Split price from payment
        let mut paid_coin = payment.split(price, ctx);

        // 5-6. Calculate shares
        let reporter_share = price * pricing.reporter_share_bps / 10000;
        let _platform_share = price - reporter_share;

        // 7. Transfer reporter share
        let reporter_coin = paid_coin.split(reporter_share, ctx);
        transfer::public_transfer(reporter_coin, intel.reporter());

        // 8. Deposit platform share to treasury
        balance::join(subscription::treasury_mut(config), paid_coin.into_balance());

        // 9. Mint UnlockReceipt
        let receipt = UnlockReceipt {
            id: object::new(ctx),
            original_buyer: ctx.sender(),
            intel_id: object::id(intel),
            unlocked_at: clock.timestamp_ms(),
            price_paid: price,
        };

        let receipt_id = object::id(&receipt);

        // 10. Emit event
        event::emit(IntelUnlockedEvent {
            receipt_id,
            buyer: ctx.sender(),
            intel_id: object::id(intel),
            price_paid: price,
            reporter_share,
        });

        transfer::transfer(receipt, ctx.sender());
    }

    public fun verify_access(
        nft: &subscription::SubscriptionNFT,
        clock: &Clock,
    ): bool {
        subscription::is_active_premium(nft, clock)
    }

    // ═══════════════════════════════════════════════
    // Accessor functions
    // ═══════════════════════════════════════════════

    public fun base_unlock_price(pricing: &PricingTable): u64 {
        pricing.base_unlock_price
    }

    public fun reporter_share_bps(pricing: &PricingTable): u64 {
        pricing.reporter_share_bps
    }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_pricing_table_for_testing(ctx: &mut TxContext): PricingTable {
        PricingTable {
            id: object::new(ctx),
            base_unlock_price: admin::default_base_unlock_price(),
            type_multipliers: vec_map::empty(),
            reporter_share_bps: admin::default_reporter_share_bps(),
        }
    }

    #[test_only]
    public fun destroy_pricing_table_for_testing(table: PricingTable) {
        let PricingTable { id, base_unlock_price: _, type_multipliers: _, reporter_share_bps: _ } = table;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_receipt_for_testing(receipt: UnlockReceipt) {
        let UnlockReceipt { id, original_buyer: _, intel_id: _, unlocked_at: _, price_paid: _ } = receipt;
        object::delete(id);
    }
}
