module frontier_explorer_hub::subscription {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    use frontier_explorer_hub::admin;

    // ═══════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════

    const MS_PER_DAY: u64 = 86_400_000;

    // ═══════════════════════════════════════════════
    // Error codes (mirrored from admin for abort origin)
    // ═══════════════════════════════════════════════

    const EInsufficientPayment: u64 = 6;
    const ENotPremium: u64 = 8;
    const EPriceBelowMinimum: u64 = 9;
    const EPriceAboveMaximum: u64 = 10;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct SubscriptionNFT has key, store {
        id: UID,
        tier: u8,
        started_at: u64,
        expires_at: u64,
    }

    public struct SubscriptionConfig has key {
        id: UID,
        premium_price_per_day: u64,
        treasury: Balance<SUI>,
    }

    public struct SubscriptionCreatedEvent has copy, drop {
        subscription_id: ID,
        subscriber: address,
        tier: u8,
        expires_at: u64,
    }

    // ═══════════════════════════════════════════════
    // Admin functions
    // ═══════════════════════════════════════════════

    public fun create_config(_admin: &admin::AdminCap, ctx: &mut TxContext) {
        let config = SubscriptionConfig {
            id: object::new(ctx),
            premium_price_per_day: admin::default_premium_price_per_day(),
            treasury: balance::zero(),
        };
        transfer::share_object(config);
    }

    public fun set_price_per_day(
        _admin: &admin::AdminCap,
        config: &mut SubscriptionConfig,
        new_price: u64,
    ) {
        assert!(new_price >= admin::min_price_per_day(), EPriceBelowMinimum);
        assert!(new_price <= admin::max_price_per_day(), EPriceAboveMaximum);
        config.premium_price_per_day = new_price;
    }

    public fun withdraw_treasury(
        _admin: &admin::AdminCap,
        config: &mut SubscriptionConfig,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        let bal = balance::split(&mut config.treasury, amount);
        coin::from_balance(bal, ctx)
    }

    // ═══════════════════════════════════════════════
    // User functions
    // ═══════════════════════════════════════════════

    public fun subscribe(
        config: &mut SubscriptionConfig,
        payment: &mut Coin<SUI>,
        days: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let cost = config.premium_price_per_day * days;
        assert!(payment.value() >= cost, EInsufficientPayment);

        let paid = payment.split(cost, ctx);
        balance::join(&mut config.treasury, paid.into_balance());

        let now = clock.timestamp_ms();
        let expires = now + days * MS_PER_DAY;

        let nft = SubscriptionNFT {
            id: object::new(ctx),
            tier: admin::tier_premium(),
            started_at: now,
            expires_at: expires,
        };

        event::emit(SubscriptionCreatedEvent {
            subscription_id: object::id(&nft),
            subscriber: ctx.sender(),
            tier: admin::tier_premium(),
            expires_at: expires,
        });

        transfer::transfer(nft, ctx.sender());
    }

    public fun renew(
        config: &mut SubscriptionConfig,
        nft: &mut SubscriptionNFT,
        payment: &mut Coin<SUI>,
        days: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let cost = config.premium_price_per_day * days;
        assert!(payment.value() >= cost, EInsufficientPayment);

        let paid = payment.split(cost, ctx);
        balance::join(&mut config.treasury, paid.into_balance());

        let now = clock.timestamp_ms();
        if (nft.expires_at < now) {
            nft.expires_at = now + days * MS_PER_DAY;
        } else {
            nft.expires_at = nft.expires_at + days * MS_PER_DAY;
        };
    }

    public fun upgrade(
        config: &mut SubscriptionConfig,
        nft: &mut SubscriptionNFT,
        payment: &mut Coin<SUI>,
        days: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(nft.tier == admin::tier_free(), ENotPremium);

        let cost = config.premium_price_per_day * days;
        assert!(payment.value() >= cost, EInsufficientPayment);

        let paid = payment.split(cost, ctx);
        balance::join(&mut config.treasury, paid.into_balance());

        let now = clock.timestamp_ms();
        nft.tier = admin::tier_premium();
        nft.started_at = now;
        nft.expires_at = now + days * MS_PER_DAY;
    }

    // ═══════════════════════════════════════════════
    // View functions
    // ═══════════════════════════════════════════════

    public fun is_active_premium(nft: &SubscriptionNFT, clock: &Clock): bool {
        nft.tier == admin::tier_premium() && nft.expires_at > clock.timestamp_ms()
    }

    public fun treasury_balance(config: &SubscriptionConfig): u64 {
        config.treasury.value()
    }

    public fun treasury_mut(config: &mut SubscriptionConfig): &mut Balance<SUI> {
        &mut config.treasury
    }

    // ═══════════════════════════════════════════════
    // Accessor functions
    // ═══════════════════════════════════════════════

    public fun tier(nft: &SubscriptionNFT): u8 { nft.tier }
    public fun started_at(nft: &SubscriptionNFT): u64 { nft.started_at }
    public fun expires_at(nft: &SubscriptionNFT): u64 { nft.expires_at }
    public fun premium_price_per_day(config: &SubscriptionConfig): u64 { config.premium_price_per_day }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_config_for_testing(ctx: &mut TxContext): SubscriptionConfig {
        SubscriptionConfig {
            id: object::new(ctx),
            premium_price_per_day: admin::default_premium_price_per_day(),
            treasury: balance::zero(),
        }
    }

    #[test_only]
    public fun destroy_config_for_testing(config: SubscriptionConfig) {
        let SubscriptionConfig { id, premium_price_per_day: _, treasury } = config;
        object::delete(id);
        balance::destroy_for_testing(treasury);
    }

    #[test_only]
    public fun create_free_nft_for_testing(clock: &Clock, ctx: &mut TxContext): SubscriptionNFT {
        let _ = clock;
        SubscriptionNFT {
            id: object::new(ctx),
            tier: 0,
            started_at: 0,
            expires_at: 0,
        }
    }
}
