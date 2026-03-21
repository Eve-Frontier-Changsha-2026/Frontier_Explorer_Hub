#[test_only]
module frontier_explorer_hub::marketplace_tests {
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;
    use sui::test_utils;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::marketplace;
    use frontier_explorer_hub::subscription;

    #[test]
    fun test_register_plugin() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = marketplace::create_registry_for_testing(&mut ctx);

        let plugin_id = marketplace::register_plugin(
            &mut registry,
            b"manifest_hash_abc",
            1_000_000,
            7000,
            &clock,
            &mut ctx,
        );

        assert!(marketplace::plugin_count(&registry) == 1);
        assert!(marketplace::is_plugin_active(&registry, plugin_id));

        // cleanup
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        marketplace::remove_plugin(&admin_cap, &mut registry, plugin_id);
        test_utils::destroy(admin_cap);
        marketplace::destroy_registry_for_testing(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_deactivate_plugin() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = marketplace::create_registry_for_testing(&mut ctx);

        let plugin_id = marketplace::register_plugin(
            &mut registry,
            b"manifest_hash_abc",
            1_000_000,
            7000,
            &clock,
            &mut ctx,
        );

        marketplace::deactivate_plugin(&mut registry, plugin_id, &ctx);
        assert!(!marketplace::is_plugin_active(&registry, plugin_id));

        // cleanup
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        marketplace::remove_plugin(&admin_cap, &mut registry, plugin_id);
        test_utils::destroy(admin_cap);
        marketplace::destroy_registry_for_testing(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = marketplace::ENotDeveloper)]
    fun test_deactivate_plugin_not_developer() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = marketplace::create_registry_for_testing(&mut ctx);

        // Register with default sender (@0x0)
        let plugin_id = marketplace::register_plugin(
            &mut registry,
            b"manifest_hash_abc",
            1_000_000,
            7000,
            &clock,
            &mut ctx,
        );

        // Try to deactivate from a different sender
        let ctx_b = tx_context::new_from_hint(@0xB, 0, 0, 0, 0);
        marketplace::deactivate_plugin(&mut registry, plugin_id, &ctx_b);

        // cleanup (won't reach here due to abort)
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        marketplace::remove_plugin(&admin_cap, &mut registry, plugin_id);
        test_utils::destroy(admin_cap);
        marketplace::destroy_registry_for_testing(registry);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_remove_plugin_requires_admin() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = marketplace::create_registry_for_testing(&mut ctx);
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);

        let plugin_id = marketplace::register_plugin(
            &mut registry,
            b"manifest_hash_abc",
            1_000_000,
            7000,
            &clock,
            &mut ctx,
        );

        marketplace::remove_plugin(&admin_cap, &mut registry, plugin_id);
        assert!(marketplace::plugin_count(&registry) == 0);

        // cleanup
        marketplace::destroy_registry_for_testing(registry);
        clock::destroy_for_testing(clock);
        test_utils::destroy(admin_cap);
    }

    // ═══════════════════════════════════════════════
    // Monkey Tests — extreme inputs & boundary values
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = marketplace::EPluginNotActive)]
    fun test_monkey_use_deactivated_plugin() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = marketplace::create_registry_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        let plugin_id = marketplace::register_plugin(
            &mut registry, b"hash", 1_000_000, 7000, &clock, &mut ctx,
        );

        // Deactivate
        marketplace::deactivate_plugin(&mut registry, plugin_id, &ctx);

        // Try to use → EPluginNotActive
        let mut payment = coin::mint_for_testing<SUI>(10_000_000, &mut ctx);
        marketplace::use_plugin(
            &registry, plugin_id, &mut payment, &mut config, &clock, &mut ctx,
        );

        // Cleanup (unreachable)
        coin::burn_for_testing(payment);
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        marketplace::remove_plugin(&admin_cap, &mut registry, plugin_id);
        test_utils::destroy(admin_cap);
        marketplace::destroy_registry_for_testing(registry);
        subscription::destroy_config_for_testing(config);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_monkey_register_zero_price_plugin() {
        // Free plugin (price = 0) — no revenue split, just receipt
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut registry = marketplace::create_registry_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        let plugin_id = marketplace::register_plugin(
            &mut registry, b"free_plugin", 0, 7000, &clock, &mut ctx,
        );

        // Use free plugin — payment unused since price = 0
        let mut payment = coin::mint_for_testing<SUI>(1_000_000, &mut ctx);
        marketplace::use_plugin(
            &registry, plugin_id, &mut payment, &mut config, &clock, &mut ctx,
        );

        // Payment untouched, treasury empty
        assert!(payment.value() == 1_000_000);
        assert!(subscription::treasury_balance(&config) == 0);

        // Cleanup
        coin::burn_for_testing(payment);
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        marketplace::remove_plugin(&admin_cap, &mut registry, plugin_id);
        test_utils::destroy(admin_cap);
        marketplace::destroy_registry_for_testing(registry);
        subscription::destroy_config_for_testing(config);
        clock::destroy_for_testing(clock);
    }
}
