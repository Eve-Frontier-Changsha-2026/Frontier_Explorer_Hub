module frontier_explorer_hub::admin {
    // ═══════════════════════════════════════════════
    // OTW + AdminCap
    // ═══════════════════════════════════════════════

    /// One-time witness — must match module name in CAPS
    public struct ADMIN has drop {}

    /// Admin capability — minted exactly once in init()
    public struct AdminCap has key, store {
        id: UID,
    }

    fun init(_otw: ADMIN, ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            ctx.sender(),
        );
    }

    // ═══════════════════════════════════════════════
    // Intel type constants
    // ═══════════════════════════════════════════════

    const INTEL_RESOURCE: u8 = 0;
    const INTEL_THREAT: u8 = 1;
    const INTEL_WRECKAGE: u8 = 2;
    const INTEL_POPULATION: u8 = 3;
    const INTEL_TYPE_COUNT: u8 = 4;

    // ═══════════════════════════════════════════════
    // Severity
    // ═══════════════════════════════════════════════

    const MAX_SEVERITY: u8 = 10;

    // ═══════════════════════════════════════════════
    // Visibility constants
    // ═══════════════════════════════════════════════

    const VIS_PUBLIC: u8 = 0;
    const VIS_PRIVATE: u8 = 1;
    const VIS_COUNT: u8 = 2; // Hackathon scope: only public + private

    // ═══════════════════════════════════════════════
    // Subscription tiers
    // ═══════════════════════════════════════════════

    const TIER_FREE: u8 = 0;
    const TIER_PREMIUM: u8 = 1;

    // ═══════════════════════════════════════════════
    // Economic bounds
    // ═══════════════════════════════════════════════

    const MIN_REPORTER_SHARE_BPS: u64 = 1000;      // reporter gets at least 10%
    const MAX_REPORTER_SHARE_BPS: u64 = 9000;      // platform gets at least 10%
    const MIN_PRICE_PER_DAY: u64 = 100_000_000;    // 0.1 SUI floor
    const MAX_PRICE_PER_DAY: u64 = 100_000_000_000; // 100 SUI ceiling
    const MIN_SUBMIT_DEPOSIT: u64 = 10_000_000;    // 0.01 SUI anti-spam
    const DEFAULT_PREMIUM_PRICE_PER_DAY: u64 = 1_000_000_000; // 1 SUI/day
    const DEFAULT_BASE_UNLOCK_PRICE: u64 = 100_000_000;       // 0.1 SUI
    const DEFAULT_REPORTER_SHARE_BPS: u64 = 7000;             // 70%

    // ═══════════════════════════════════════════════
    // Batch limits
    // ═══════════════════════════════════════════════

    const MAX_BATCH_SIZE: u64 = 20;

    // ═══════════════════════════════════════════════
    // Market defaults
    // ═══════════════════════════════════════════════

    const DEFAULT_MARKET_FEE_BPS: u64 = 250;          // 2.5% platform fee
    const DEFAULT_MARKET_MIN_PRICE: u64 = 10_000_000;  // 0.01 SUI
    const DEFAULT_MARKET_MAX_BUYERS: u64 = 100;
    const MAX_MARKET_FEE_BPS: u64 = 5000;              // 50% ceiling
    const MAX_MARKET_PAYLOAD_SIZE: u64 = 4096;          // 4KB

    // ═══════════════════════════════════════════════
    // Error codes
    // ═══════════════════════════════════════════════

    const EInvalidSeverity: u64 = 0;
    const EInvalidVisibility: u64 = 1;
    const EInvalidIntelType: u64 = 2;
    const EInsufficientDeposit: u64 = 3;
    const ENotReporter: u64 = 4;
    const EIntelNotExpired: u64 = 5;
    const EInsufficientPayment: u64 = 6;
    const ESubscriptionExpired: u64 = 7;
    const ENotPremium: u64 = 8;
    const EPriceBelowMinimum: u64 = 9;
    const EPriceAboveMaximum: u64 = 10;
    const EShareBelowMinimum: u64 = 11;
    const EShareAboveMaximum: u64 = 12;
    const ESlippageExceeded: u64 = 13;
    const EBatchTooLarge: u64 = 19;
    const ENotDeveloper: u64 = 20;
    const EPluginNotActive: u64 = 21;
    const EPluginNotFound: u64 = 22;

    // ═══════════════════════════════════════════════
    // Public accessor functions — intel types
    // ═══════════════════════════════════════════════

    public fun intel_resource(): u8 { INTEL_RESOURCE }
    public fun intel_threat(): u8 { INTEL_THREAT }
    public fun intel_wreckage(): u8 { INTEL_WRECKAGE }
    public fun intel_population(): u8 { INTEL_POPULATION }
    public fun intel_type_count(): u8 { INTEL_TYPE_COUNT }

    // ═══════════════════════════════════════════════
    // Public accessor functions — severity
    // ═══════════════════════════════════════════════

    public fun max_severity(): u8 { MAX_SEVERITY }

    // ═══════════════════════════════════════════════
    // Public accessor functions — visibility
    // ═══════════════════════════════════════════════

    public fun vis_public(): u8 { VIS_PUBLIC }
    public fun vis_private(): u8 { VIS_PRIVATE }
    public fun vis_count(): u8 { VIS_COUNT }

    // ═══════════════════════════════════════════════
    // Public accessor functions — tiers
    // ═══════════════════════════════════════════════

    public fun tier_free(): u8 { TIER_FREE }
    public fun tier_premium(): u8 { TIER_PREMIUM }

    // ═══════════════════════════════════════════════
    // Public accessor functions — economic bounds
    // ═══════════════════════════════════════════════

    public fun min_reporter_share_bps(): u64 { MIN_REPORTER_SHARE_BPS }
    public fun max_reporter_share_bps(): u64 { MAX_REPORTER_SHARE_BPS }
    public fun min_price_per_day(): u64 { MIN_PRICE_PER_DAY }
    public fun max_price_per_day(): u64 { MAX_PRICE_PER_DAY }
    public fun min_submit_deposit(): u64 { MIN_SUBMIT_DEPOSIT }
    public fun default_premium_price_per_day(): u64 { DEFAULT_PREMIUM_PRICE_PER_DAY }
    public fun default_base_unlock_price(): u64 { DEFAULT_BASE_UNLOCK_PRICE }
    public fun default_reporter_share_bps(): u64 { DEFAULT_REPORTER_SHARE_BPS }

    // ═══════════════════════════════════════════════
    // Public accessor functions — batch
    // ═══════════════════════════════════════════════

    public fun max_batch_size(): u64 { MAX_BATCH_SIZE }

    // ═══════════════════════════════════════════════
    // Public accessor functions — market
    // ═══════════════════════════════════════════════

    public fun default_market_fee_bps(): u64 { DEFAULT_MARKET_FEE_BPS }
    public fun default_market_min_price(): u64 { DEFAULT_MARKET_MIN_PRICE }
    public fun default_market_max_buyers(): u64 { DEFAULT_MARKET_MAX_BUYERS }
    public fun max_market_fee_bps(): u64 { MAX_MARKET_FEE_BPS }
    public fun max_market_payload_size(): u64 { MAX_MARKET_PAYLOAD_SIZE }

    // ═══════════════════════════════════════════════
    // Public accessor functions — error codes
    // ═══════════════════════════════════════════════

    public fun e_invalid_severity(): u64 { EInvalidSeverity }
    public fun e_invalid_visibility(): u64 { EInvalidVisibility }
    public fun e_invalid_intel_type(): u64 { EInvalidIntelType }
    public fun e_insufficient_deposit(): u64 { EInsufficientDeposit }
    public fun e_not_reporter(): u64 { ENotReporter }
    public fun e_intel_not_expired(): u64 { EIntelNotExpired }
    public fun e_insufficient_payment(): u64 { EInsufficientPayment }
    public fun e_subscription_expired(): u64 { ESubscriptionExpired }
    public fun e_not_premium(): u64 { ENotPremium }
    public fun e_price_below_minimum(): u64 { EPriceBelowMinimum }
    public fun e_price_above_maximum(): u64 { EPriceAboveMaximum }
    public fun e_share_below_minimum(): u64 { EShareBelowMinimum }
    public fun e_share_above_maximum(): u64 { EShareAboveMaximum }
    public fun e_slippage_exceeded(): u64 { ESlippageExceeded }
    public fun e_batch_too_large(): u64 { EBatchTooLarge }
    public fun e_not_developer(): u64 { ENotDeveloper }
    public fun e_plugin_not_active(): u64 { EPluginNotActive }
    public fun e_plugin_not_found(): u64 { EPluginNotFound }

    // ═══════════════════════════════════════════════
    // Validation helpers
    // ═══════════════════════════════════════════════

    public fun is_valid_intel_type(t: u8): bool { t < INTEL_TYPE_COUNT }
    public fun is_valid_severity(s: u8): bool { s <= MAX_SEVERITY }
    public fun is_valid_visibility(v: u8): bool { v < VIS_COUNT }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_admin_cap_for_testing(ctx: &mut TxContext): AdminCap {
        AdminCap { id: object::new(ctx) }
    }
}
