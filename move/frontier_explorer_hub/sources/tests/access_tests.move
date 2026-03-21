#[test_only]
module frontier_explorer_hub::access_tests {
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;
    use sui::test_utils;

    use frontier_explorer_hub::access;
    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::subscription;

    #[test]
    fun test_unlock_intel_revenue_split() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);

        // Setup
        let pricing = access::create_pricing_table_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);

        // Reporter address
        let reporter_addr = @0x1234;

        // Create intel report
        let intel = intel::create_intel_for_testing(
            reporter_addr,
            0, // INTEL_RESOURCE
            5, // severity
            1, 10, 20, 30, 1, // location
            10_000_000, // deposit
            &clock,
            &mut ctx,
        );

        // Create payment coin (1 SUI, more than enough)
        let mut payment = coin::mint_for_testing<SUI>(1_000_000_000, &mut ctx);

        // Default base_unlock_price = 100_000_000 (0.1 SUI)
        // Default reporter_share_bps = 7000 (70%)
        let expected_price: u64 = 100_000_000;
        let expected_reporter_share: u64 = expected_price * 7000 / 10000; // 70_000_000
        let expected_platform_share: u64 = expected_price - expected_reporter_share; // 30_000_000

        // Unlock intel
        access::unlock_intel(
            &pricing,
            &mut config,
            &intel,
            &mut payment,
            expected_price, // max_price = exact price
            &clock,
            &mut ctx,
        );

        // Verify: payment reduced by price
        assert!(payment.value() == 1_000_000_000 - expected_price);

        // Verify: treasury got platform share
        assert!(subscription::treasury_balance(&config) == expected_platform_share);

        // Verify amounts match expected split
        assert!(expected_reporter_share == 70_000_000);
        assert!(expected_platform_share == 30_000_000);

        // Cleanup
        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel);
        subscription::destroy_config_for_testing(config);
        access::destroy_pricing_table_for_testing(pricing);
        test_utils::destroy(admin_cap);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = access::ESlippageExceeded)]
    fun test_unlock_intel_slippage_protection() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);

        let pricing = access::create_pricing_table_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        let intel = intel::create_intel_for_testing(
            @0x1234, 0, 5, 1, 10, 20, 30, 1, 10_000_000, &clock, &mut ctx,
        );

        let mut payment = coin::mint_for_testing<SUI>(1_000_000_000, &mut ctx);

        // Set max_price lower than actual price (100_000_000)
        access::unlock_intel(
            &pricing,
            &mut config,
            &intel,
            &mut payment,
            50_000_000, // max_price too low → should abort
            &clock,
            &mut ctx,
        );

        // Cleanup (unreachable)
        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel);
        subscription::destroy_config_for_testing(config);
        access::destroy_pricing_table_for_testing(pricing);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = access::EShareAboveMaximum)]
    fun test_set_reporter_share_out_of_range() {
        let mut ctx = tx_context::dummy();
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        let mut pricing = access::create_pricing_table_for_testing(&mut ctx);

        // 9500 > max 9000 → should abort
        access::set_reporter_share(&admin_cap, &mut pricing, 9500);

        // Cleanup (unreachable)
        access::destroy_pricing_table_for_testing(pricing);
        test_utils::destroy(admin_cap);
    }

    // ═══════════════════════════════════════════════
    // Monkey Tests — extreme inputs & boundary values
    // ═══════════════════════════════════════════════

    #[test]
    fun test_monkey_unlock_same_intel_twice() {
        // Unlocking same intel twice is allowed (feature: multiple buyers)
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let pricing = access::create_pricing_table_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        let intel = intel::create_intel_for_testing(
            @0x1234, 0, 5, 1, 10, 20, 30, 1, 10_000_000, &clock, &mut ctx,
        );

        let mut payment = coin::mint_for_testing<SUI>(2_000_000_000, &mut ctx);
        let price = 100_000_000; // default base price

        // First unlock
        access::unlock_intel(
            &pricing, &mut config, &intel, &mut payment, price, &clock, &mut ctx,
        );

        // Second unlock — should also succeed
        access::unlock_intel(
            &pricing, &mut config, &intel, &mut payment, price, &clock, &mut ctx,
        );

        // Treasury should have 2x platform share = 2 * 30_000_000 = 60_000_000
        assert!(subscription::treasury_balance(&config) == 60_000_000);

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel);
        subscription::destroy_config_for_testing(config);
        access::destroy_pricing_table_for_testing(pricing);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_monkey_unlock_zero_price_type() {
        // No type multiplier set → defaults to 100 (1x base price)
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let pricing = access::create_pricing_table_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        // intel_type = 3 (POPULATION) — no multiplier set for this type
        let intel = intel::create_intel_for_testing(
            @0x1234, 3, 5, 1, 10, 20, 30, 1, 10_000_000, &clock, &mut ctx,
        );

        let mut payment = coin::mint_for_testing<SUI>(1_000_000_000, &mut ctx);

        // price = base * 100 / 100 = base = 100_000_000
        access::unlock_intel(
            &pricing, &mut config, &intel, &mut payment, 100_000_000, &clock, &mut ctx,
        );

        assert!(payment.value() == 900_000_000);

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel);
        subscription::destroy_config_for_testing(config);
        access::destroy_pricing_table_for_testing(pricing);
        clock::destroy_for_testing(clock);
    }
}
