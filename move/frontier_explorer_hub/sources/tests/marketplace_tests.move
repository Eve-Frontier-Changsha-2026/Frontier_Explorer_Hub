#[test_only]
module frontier_explorer_hub::marketplace_tests {
    use sui::clock;
    use sui::test_utils;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::marketplace;

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
}
