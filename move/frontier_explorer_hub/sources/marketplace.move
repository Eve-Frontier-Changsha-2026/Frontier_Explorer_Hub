module frontier_explorer_hub::marketplace {
    use sui::table::{Self, Table};
    use sui::coin::{Self, Coin};
    use sui::balance;
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::subscription;

    // ═══════════════════════════════════════════════
    // Error codes (mirrored from admin)
    // ═══════════════════════════════════════════════

    const EInsufficientPayment: u64 = 6;
    const ENotDeveloper: u64 = 20;
    const EPluginNotActive: u64 = 21;
    const EPluginNotFound: u64 = 22;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct PluginListing has store {
        developer: address,
        manifest_hash: vector<u8>,
        price_per_use: u64,
        revenue_split_bps: u64,
        active: bool,
        registered_at: u64,
    }

    public struct PluginRegistry has key {
        id: UID,
        plugins: Table<ID, PluginListing>,
        platform_fee_bps: u64,
    }

    public struct PluginUsageReceipt has key, store {
        id: UID,
        user: address,
        plugin_id: ID,
        paid: u64,
        timestamp: u64,
    }

    public struct PluginRegisteredEvent has copy, drop {
        plugin_id: ID,
        developer: address,
        price_per_use: u64,
    }

    public struct PluginUsedEvent has copy, drop {
        plugin_id: ID,
        user: address,
        paid: u64,
    }

    // ═══════════════════════════════════════════════
    // Admin functions
    // ═══════════════════════════════════════════════

    public fun create_registry(
        _admin: &admin::AdminCap,
        platform_fee_bps: u64,
        ctx: &mut TxContext,
    ) {
        let registry = PluginRegistry {
            id: object::new(ctx),
            plugins: table::new(ctx),
            platform_fee_bps,
        };
        transfer::share_object(registry);
    }

    // ═══════════════════════════════════════════════
    // Developer functions
    // ═══════════════════════════════════════════════

    public fun register_plugin(
        registry: &mut PluginRegistry,
        manifest_hash: vector<u8>,
        price_per_use: u64,
        revenue_split_bps: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        let listing = PluginListing {
            developer: ctx.sender(),
            manifest_hash,
            price_per_use,
            revenue_split_bps,
            active: true,
            registered_at: clock.timestamp_ms(),
        };

        let uid = object::new(ctx);
        let plugin_id = object::uid_to_inner(&uid);
        object::delete(uid);

        registry.plugins.add(plugin_id, listing);

        event::emit(PluginRegisteredEvent {
            plugin_id,
            developer: ctx.sender(),
            price_per_use,
        });

        plugin_id
    }

    public fun deactivate_plugin(
        registry: &mut PluginRegistry,
        plugin_id: ID,
        ctx: &TxContext,
    ) {
        assert!(registry.plugins.contains(plugin_id), EPluginNotFound);
        let listing = &mut registry.plugins[plugin_id];
        assert!(ctx.sender() == listing.developer, ENotDeveloper);
        listing.active = false;
    }

    // ═══════════════════════════════════════════════
    // User functions
    // ═══════════════════════════════════════════════

    public fun use_plugin(
        registry: &PluginRegistry,
        plugin_id: ID,
        payment: &mut Coin<SUI>,
        config: &mut subscription::SubscriptionConfig,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(registry.plugins.contains(plugin_id), EPluginNotFound);
        let listing = &registry.plugins[plugin_id];
        assert!(listing.active, EPluginNotActive);

        let price = listing.price_per_use;
        if (price > 0) {
            assert!(payment.value() >= price, EInsufficientPayment);
            let mut price_coin = payment.split(price, ctx);
            let dev_share_amount = price * listing.revenue_split_bps / 10000;
            let dev_coin = price_coin.split(dev_share_amount, ctx);
            transfer::public_transfer(dev_coin, listing.developer);
            // remainder is platform share → deposit to treasury
            let platform_bal = coin::into_balance(price_coin);
            balance::join(subscription::treasury_mut(config), platform_bal);
        };

        let receipt = PluginUsageReceipt {
            id: object::new(ctx),
            user: ctx.sender(),
            plugin_id,
            paid: price,
            timestamp: clock.timestamp_ms(),
        };
        transfer::transfer(receipt, ctx.sender());

        event::emit(PluginUsedEvent {
            plugin_id,
            user: ctx.sender(),
            paid: price,
        });
    }

    // ═══════════════════════════════════════════════
    // Admin moderation
    // ═══════════════════════════════════════════════

    public fun remove_plugin(
        _admin: &admin::AdminCap,
        registry: &mut PluginRegistry,
        plugin_id: ID,
    ) {
        assert!(registry.plugins.contains(plugin_id), EPluginNotFound);
        let listing = registry.plugins.remove(plugin_id);
        let PluginListing {
            developer: _,
            manifest_hash: _,
            price_per_use: _,
            revenue_split_bps: _,
            active: _,
            registered_at: _,
        } = listing;
    }

    // ═══════════════════════════════════════════════
    // Accessor functions
    // ═══════════════════════════════════════════════

    public fun platform_fee_bps(registry: &PluginRegistry): u64 {
        registry.platform_fee_bps
    }

    public fun plugin_count(registry: &PluginRegistry): u64 {
        registry.plugins.length()
    }

    public fun is_plugin_active(registry: &PluginRegistry, plugin_id: ID): bool {
        let listing = &registry.plugins[plugin_id];
        listing.active
    }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_registry_for_testing(ctx: &mut TxContext): PluginRegistry {
        PluginRegistry {
            id: object::new(ctx),
            plugins: table::new(ctx),
            platform_fee_bps: 500,
        }
    }

    #[test_only]
    public fun destroy_registry_for_testing(registry: PluginRegistry) {
        // Table must be empty to destroy; caller should remove entries first
        // but we can't iterate Table easily, so we just destroy
        let PluginRegistry { id, plugins, platform_fee_bps: _ } = registry;
        plugins.destroy_empty();
        object::delete(id);
    }
}
