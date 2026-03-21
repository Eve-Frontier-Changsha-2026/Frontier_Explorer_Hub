#[test_only]
module frontier_explorer_hub::intel_tests {
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;

    #[test]
    fun test_submit_intel_success() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(admin::min_submit_deposit(), &mut ctx);

        intel::submit_intel(
            &clock,
            deposit,
            1,    // region_id
            10,   // sector_x
            20,   // sector_y
            30,   // sector_z
            3,    // zoom_level
            vector[1, 2, 3], // raw_location_hash
            admin::intel_resource(), // intel_type
            5,    // severity
            1000000, // expiry
            admin::vis_public(), // visibility
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = intel::EInvalidSeverity)]
    fun test_submit_intel_invalid_severity() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(admin::min_submit_deposit(), &mut ctx);

        intel::submit_intel(
            &clock,
            deposit,
            1, 10, 20, 30, 3,
            vector[1, 2, 3],
            admin::intel_resource(),
            11,   // invalid severity
            1000000,
            admin::vis_public(),
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = intel::EInsufficientDeposit)]
    fun test_submit_intel_insufficient_deposit() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(1, &mut ctx); // too small

        intel::submit_intel(
            &clock,
            deposit,
            1, 10, 20, 30, 3,
            vector[1, 2, 3],
            admin::intel_resource(),
            5,
            1000000,
            admin::vis_public(),
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = intel::EInvalidVisibility)]
    fun test_submit_intel_invalid_visibility() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(admin::min_submit_deposit(), &mut ctx);

        intel::submit_intel(
            &clock,
            deposit,
            1, 10, 20, 30, 3,
            vector[1, 2, 3],
            admin::intel_resource(),
            5,
            1000000,
            5,    // invalid visibility
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = intel::ENotReporter)]
    fun test_update_visibility_not_reporter() {
        let mut ctx1 = tx_context::dummy(); // sender = @0x0
        let clock = clock::create_for_testing(&mut ctx1);

        // Create intel with reporter = @0x1
        let mut intel_report = intel::create_intel_for_testing(
            @0x1,
            admin::intel_resource(),
            5,
            1, 10, 20, 30, 3,
            admin::min_submit_deposit(),
            &clock,
            &mut ctx1,
        );

        // Use ctx with sender @0x2 (not the reporter)
        let ctx2 = tx_context::new_from_hint(@0x2, 0, 0, 0, 0);

        intel::update_visibility(&mut intel_report, admin::vis_private(), &ctx2);

        // Cleanup (won't reach here due to expected failure)
        intel::destroy_intel_for_testing(intel_report);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_batch_submit_success() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);

        let total = admin::min_submit_deposit() * 3;
        let mut deposit = coin::mint_for_testing<SUI>(total, &mut ctx);

        let params = vector[
            intel::new_intel_params(1, 10, 20, 30, 3, vector[1], admin::intel_resource(), 5, 1000000, admin::vis_public()),
            intel::new_intel_params(1, 11, 21, 31, 3, vector[2], admin::intel_threat(), 3, 1000000, admin::vis_private()),
            intel::new_intel_params(2, 12, 22, 32, 3, vector[3], admin::intel_wreckage(), 7, 1000000, admin::vis_public()),
        ];

        intel::batch_submit(&clock, &mut deposit, params, &mut ctx);

        // Remaining deposit should be 0
        assert!(deposit.value() == 0);

        // Cleanup
        coin::burn_for_testing(deposit);
        clock::destroy_for_testing(clock);
    }

    // ═══════════════════════════════════════════════
    // Monkey Tests — extreme inputs & boundary values
    // ═══════════════════════════════════════════════

    #[test]
    fun test_monkey_max_severity_boundary() {
        // severity = 10 (MAX_SEVERITY) should succeed
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(admin::min_submit_deposit(), &mut ctx);

        intel::submit_intel(
            &clock, deposit,
            1, 10, 20, 30, 3, vector[1, 2, 3],
            admin::intel_resource(),
            10, // MAX_SEVERITY boundary
            1000000, admin::vis_public(), &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = intel::EInsufficientDeposit)]
    fun test_monkey_zero_deposit() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(0, &mut ctx); // zero

        intel::submit_intel(
            &clock, deposit,
            1, 10, 20, 30, 3, vector[1],
            admin::intel_resource(), 5, 1000000, admin::vis_public(),
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_monkey_max_u64_coordinates() {
        // u64::MAX for sector coords — no constraint on range, should succeed
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(admin::min_submit_deposit(), &mut ctx);

        intel::submit_intel(
            &clock, deposit,
            18446744073709551615, // u64::MAX region_id
            18446744073709551615, // u64::MAX sector_x
            18446744073709551615, // u64::MAX sector_y
            18446744073709551615, // u64::MAX sector_z
            255,                  // u8::MAX zoom_level
            vector[],
            admin::intel_resource(), 5, 1000000, admin::vis_public(),
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_monkey_empty_location_hash() {
        // empty vector<u8> as raw_location_hash — no constraint, should succeed
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let deposit = coin::mint_for_testing<SUI>(admin::min_submit_deposit(), &mut ctx);

        intel::submit_intel(
            &clock, deposit,
            1, 10, 20, 30, 3,
            vector[], // empty hash
            admin::intel_resource(), 5, 1000000, admin::vis_public(),
            &mut ctx,
        );

        clock::destroy_for_testing(clock);
    }
}
