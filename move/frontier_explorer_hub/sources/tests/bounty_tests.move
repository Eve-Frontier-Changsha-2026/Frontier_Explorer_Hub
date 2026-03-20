#[test_only]
module frontier_explorer_hub::bounty_tests {
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::bounty;

    #[test]
    fun test_bounty_full_lifecycle() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);

        let payment = coin::mint_for_testing<SUI>(1_000_000_000, &mut ctx);
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let intel_types = vector[0u8, 1u8];

        let mut bty = bounty::create_bounty_for_testing(
            payment,
            region,
            intel_types,
            100_000, // deadline
            &mut ctx,
        );

        // Verify initial state
        assert!(bounty::status(&bty) == admin::bounty_open());
        assert!(bounty::reward_amount(&bty) == 1_000_000_000);
        assert!(bounty::escrow_value(&bty) == 1_000_000_000);

        // Create intel matching the bounty (type=0, region=42), reporter = sender = @0x0
        let intel_report = intel::create_intel_for_testing(
            @0x0,       // reporter = dummy ctx sender
            0,          // intel_type = RESOURCE
            5,          // severity
            42,         // region_id
            10, 20, 30, // sector
            3,          // zoom
            0,          // deposit_value
            &clock,
            &mut ctx,
        );

        bounty::submit_for_bounty(&mut bty, &intel_report, &clock, &mut ctx);

        // Verify completed state
        assert!(bounty::status(&bty) == admin::bounty_completed());
        assert!(bounty::escrow_value(&bty) == 0);

        // Cleanup
        bounty::cleanup_completed_bounty(bty);
        intel::destroy_intel_for_testing(intel_report);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_bounty_refund_on_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);

        let payment = coin::mint_for_testing<SUI>(1_000_000_000, &mut ctx);
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);

        let bty = bounty::create_bounty_for_testing(
            payment,
            region,
            vector[0u8],
            1000, // deadline = 1000ms
            &mut ctx,
        );

        // Advance clock past deadline
        clock::increment_for_testing(&mut clock, 1001);

        // Refund — consumes the bounty
        bounty::refund_expired_bounty(bty, &clock, &mut ctx);

        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bounty::ENotReporter)]
    fun test_frontrunning_rejected() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);

        let payment = coin::mint_for_testing<SUI>(1_000_000_000, &mut ctx);
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);

        let mut bty = bounty::create_bounty_for_testing(
            payment,
            region,
            vector[0u8],
            100_000,
            &mut ctx,
        );

        // Intel reported by @0xA
        let intel_report = intel::create_intel_for_testing(
            @0xA,
            0, 5, 42, 10, 20, 30, 3, 0,
            &clock,
            &mut ctx,
        );

        // Submit from @0xB — should fail with ENotReporter
        let mut ctx_b = tx_context::new_from_hint(@0xB, 0, 0, 0, 0);
        bounty::submit_for_bounty(&mut bty, &intel_report, &clock, &mut ctx_b);

        // Cleanup (won't reach here)
        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_bounty_for_testing(bty);
        clock::destroy_for_testing(clock);
    }
}
