#[test_only]
module frontier_explorer_hub::bounty_tests {
    use sui::clock;

    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::bounty;

    // ═══════════════════════════════════════════════
    // Meta creation + accessors
    // ═══════════════════════════════════════════════

    #[test]
    fun test_meta_creation_and_accessors() {
        let mut ctx = tx_context::dummy();
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let types = vector[0u8, 1u8];
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let meta = bounty::create_meta_for_testing(
            fake_bounty_id,
            @0xA,
            region,
            types,
            &mut ctx,
        );

        assert!(bounty::meta_bounty_id(&meta) == fake_bounty_id);
        assert!(bounty::meta_creator(&meta) == @0xA);
        assert!(intel::region_id(&bounty::meta_target_region(&meta)) == 42);
        assert!(bounty::meta_intel_types_wanted(&meta) == vector[0u8, 1u8]);

        bounty::destroy_meta_for_testing(meta);
    }

    // ═══════════════════════════════════════════════
    // Intel matching — happy path
    // ═══════════════════════════════════════════════

    #[test]
    fun test_validate_intel_match_success() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id,
            @0xA,
            region,
            vector[0u8, 1u8],
            &mut ctx,
        );

        // Intel: type=0 (RESOURCE), region=42, reporter=@0x0 (dummy sender)
        let intel_report = intel::create_intel_for_testing(
            @0x0, 0, 5, 42, 10, 20, 30, 3, 0, &clock, &mut ctx,
        );

        // hunter = @0x0 = reporter → should pass
        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    // ═══════════════════════════════════════════════
    // Intel matching — wrong type
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_validate_wrong_intel_type() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        // Meta wants type 0 and 1 only
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id,
            @0xA,
            region,
            vector[0u8, 1u8],
            &mut ctx,
        );

        // Intel: type=2 (WRECKAGE) — not in wanted list
        let intel_report = intel::create_intel_for_testing(
            @0x0, 2, 5, 42, 10, 20, 30, 3, 0, &clock, &mut ctx,
        );

        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);

        // Unreachable
        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    // ═══════════════════════════════════════════════
    // Intel matching — wrong region
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = bounty::EIntelRegionMismatch)]
    fun test_validate_wrong_region() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        // Meta wants region 42
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id,
            @0xA,
            region,
            vector[0u8],
            &mut ctx,
        );

        // Intel: region=99 — mismatch
        let intel_report = intel::create_intel_for_testing(
            @0x0, 0, 5, 99, 10, 20, 30, 3, 0, &clock, &mut ctx,
        );

        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);

        // Unreachable
        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    // ═══════════════════════════════════════════════
    // Anti-frontrunning — reporter ≠ hunter
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = bounty::ENotReporter)]
    fun test_frontrunning_rejected() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id,
            @0xA,
            region,
            vector[0u8],
            &mut ctx,
        );

        // Intel reported by @0xA
        let intel_report = intel::create_intel_for_testing(
            @0xA, 0, 5, 42, 10, 20, 30, 3, 0, &clock, &mut ctx,
        );

        // Hunter = @0xB ≠ reporter @0xA → should fail
        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0xB);

        // Unreachable
        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    // ═══════════════════════════════════════════════
    // Monkey Tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_monkey_empty_types_wanted() {
        // Edge case: bounty wants NO intel types → nothing can match
        // This test verifies that an empty wanted list rejects all types
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id,
            @0xA,
            region,
            vector[],  // empty wanted list
            &mut ctx,
        );

        // Try to match with type 0 — should fail
        let intel_report = intel::create_intel_for_testing(
            @0x0, 0, 5, 42, 10, 20, 30, 3, 0, &clock, &mut ctx,
        );

        // We can't use #[expected_failure] here since we want to verify
        // it would fail, but let's just test the meta state
        assert!(bounty::meta_intel_types_wanted(&meta) == vector[]);

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_monkey_empty_types_rejects_all() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id, @0xA, region, vector[], &mut ctx,
        );

        let intel_report = intel::create_intel_for_testing(
            @0x0, 0, 5, 42, 10, 20, 30, 3, 0, &clock, &mut ctx,
        );

        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_monkey_all_types_accepted() {
        // Bounty wants ALL intel types (0-3) → any type should pass
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id, @0xA, region, vector[0u8, 1u8, 2u8, 3u8], &mut ctx,
        );

        // Test each type
        let mut t = 0u8;
        while (t < 4) {
            let intel_report = intel::create_intel_for_testing(
                @0x0, t, 5, 42, 10, 20, 30, 3, 0, &clock, &mut ctx,
            );
            bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);
            intel::destroy_intel_for_testing(intel_report);
            t = t + 1;
        };

        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_monkey_region_zero() {
        // Edge case: region_id = 0 should still match
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(0, 0, 0, 0, 0);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id, @0xA, region, vector[0u8], &mut ctx,
        );

        let intel_report = intel::create_intel_for_testing(
            @0x0, 0, 5, 0, 0, 0, 0, 0, 0, &clock, &mut ctx,
        );

        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }

    #[test]
    #[expected_failure(abort_code = bounty::EIntelRegionMismatch)]
    fun test_monkey_max_region_mismatch() {
        // Edge case: u64::MAX region wanted, region 0 submitted
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let fake_bounty_id = object::id_from_address(@0xBEEF);

        let region = intel::new_grid_cell(18446744073709551615, 0, 0, 0, 0);
        let meta = bounty::create_meta_for_testing(
            fake_bounty_id, @0xA, region, vector[0u8], &mut ctx,
        );

        let intel_report = intel::create_intel_for_testing(
            @0x0, 0, 5, 0, 0, 0, 0, 0, 0, &clock, &mut ctx,
        );

        bounty::validate_intel_match_for_testing(&meta, &intel_report, @0x0);

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        clock::destroy_for_testing(clock);
    }
}
