#[test_only]
module frontier_explorer_hub::bounty_tests {
    use sui::clock;
    use sui::test_scenario::{Self as ts};
    use sui::coin;
    use sui::sui::SUI;
    use bounty_escrow::bounty::{Self as be_bounty, Bounty};
    use bounty_escrow::verifier::VerifierCap;

    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::bounty;

    const CREATOR: address = @0xA;
    const VERIFIER_ADDR: address = @0xB;
    const HUNTER: address = @0xC;
    const OTHER_HUNTER: address = @0xD;
    const BASE_TIME: u64 = 1_000_000_000;
    const DEADLINE: u64 = 1_000_000_000 + 86_400_000;
    const GRACE: u64 = 86_400_000;

    /// Creates a Bounty<SUI> via bounty_escrow entry function,
    /// returns it as shared object for subsequent test steps.
    fun setup_bounty_for_proof_tests(
        scenario: &mut ts::Scenario,
        clock: &clock::Clock,
    ): Bounty<SUI> {
        ts::next_tx(scenario, CREATOR);
        let coin = coin::mint_for_testing<SUI>(5000, ts::ctx(scenario));
        be_bounty::create<SUI>(
            b"Intel hunt".to_string(),
            b"Find resource deposits".to_string(),
            coin, 1000, 100, 5,
            DEADLINE, GRACE, 100,
            VERIFIER_ADDR, clock, ts::ctx(scenario),
        );
        ts::next_tx(scenario, CREATOR);
        ts::take_shared<Bounty<SUI>>(scenario)
    }

    /// Hunter claims the bounty with stake.
    fun hunter_claim(
        scenario: &mut ts::Scenario,
        bounty: &mut Bounty<SUI>,
        hunter: address,
        clock: &clock::Clock,
    ) {
        ts::next_tx(scenario, hunter);
        let stake = coin::mint_for_testing<SUI>(100, ts::ctx(scenario));
        be_bounty::claim<SUI>(bounty, stake, clock, ts::ctx(scenario));
    }

    /// Sets up a bounty where hunter has submitted proof and been rejected,
    /// ready for resubmit testing.
    fun setup_rejected_proof(
        scenario: &mut ts::Scenario,
        bounty_obj: &mut Bounty<SUI>,
        meta: &bounty::IntelBountyMeta,
        intel: &intel::IntelReport,
        clock: &clock::Clock,
    ) {
        ts::next_tx(scenario, HUNTER);
        bounty::submit_intel_proof(
            bounty_obj, meta, intel,
            b"https://proof.example.com/v1".to_string(),
            b"Initial submission".to_string(),
            clock, ts::ctx(scenario),
        );

        ts::next_tx(scenario, VERIFIER_ADDR);
        let cap = ts::take_from_address<VerifierCap>(scenario, VERIFIER_ADDR);
        be_bounty::reject_proof<SUI>(
            bounty_obj, HUNTER,
            b"Insufficient evidence".to_string(),
            &cap, clock, ts::ctx(scenario),
        );
        ts::return_to_address(VERIFIER_ADDR, cap);
    }

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

    // ═══════════════════════════════════════════════
    // Proof submission — happy path
    // ═══════════════════════════════════════════════

    #[test]
    fun test_submit_intel_proof_success() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8, 1u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/report1".to_string(),
            b"Found resource deposit at sector 10,20,30".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        assert!(be_bounty::has_proof(&bounty_obj, HUNTER));

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        ts::return_shared(bounty_obj);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_resubmit_intel_proof_success() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        // Submit proof
        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/v1".to_string(),
            b"Initial submission".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        // Verifier rejects
        ts::next_tx(&mut scenario, VERIFIER_ADDR);
        let cap = ts::take_from_address<VerifierCap>(&scenario, VERIFIER_ADDR);
        be_bounty::reject_proof<SUI>(
            &mut bounty_obj, HUNTER,
            b"Insufficient evidence".to_string(),
            &cap, &clock, ts::ctx(&mut scenario),
        );
        ts::return_to_address(VERIFIER_ADDR, cap);

        // Resubmit via wrapper
        ts::next_tx(&mut scenario, HUNTER);
        bounty::resubmit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/v2".to_string(),
            b"Updated with better evidence".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        assert!(be_bounty::has_proof(&bounty_obj, HUNTER));

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        ts::return_shared(bounty_obj);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_submit_then_auto_approve_e2e() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        // Submit proof via wrapper
        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/report".to_string(),
            b"Resource deposit confirmed".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        // Advance clock past default review period (3 days = 259_200_000 ms)
        clock::set_for_testing(&mut clock, BASE_TIME + 259_200_001);

        // Auto-approve (call bounty_escrow directly)
        ts::next_tx(&mut scenario, HUNTER);
        be_bounty::auto_approve_proof<SUI>(
            &mut bounty_obj, &clock, ts::ctx(&mut scenario),
        );

        assert!(be_bounty::proof_status<SUI>(&bounty_obj, HUNTER) == 11); // proof_approved

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        ts::return_shared(bounty_obj);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ═══════════════════════════════════════════════
    // Submit proof — validation failures
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_submit_intel_proof_wrong_type() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8, 1u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 2, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com".to_string(),
            b"desc".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    #[test]
    #[expected_failure(abort_code = bounty::EIntelRegionMismatch)]
    fun test_submit_intel_proof_wrong_region() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 0, 5, 99, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com".to_string(),
            b"desc".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    #[test]
    #[expected_failure(abort_code = bounty::ENotReporter)]
    fun test_submit_intel_proof_not_reporter() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            OTHER_HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com".to_string(),
            b"desc".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    #[test]
    #[expected_failure(abort_code = bounty::EMetaBountyMismatch)]
    fun test_submit_intel_proof_meta_mismatch() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let wrong_bounty_id = object::id_from_address(@0xDEAD);
        let meta = bounty::create_meta_for_testing(
            wrong_bounty_id, HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com".to_string(),
            b"desc".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    // ═══════════════════════════════════════════════
    // Resubmit proof — validation failures
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_resubmit_intel_proof_wrong_type() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let valid_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        setup_rejected_proof(&mut scenario, &mut bounty_obj, &meta, &valid_intel, &clock);

        let bad_intel = intel::create_intel_for_testing(
            HUNTER, 2, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::resubmit_intel_proof(
            &mut bounty_obj, &meta, &bad_intel,
            b"https://proof.example.com/v2".to_string(),
            b"Updated".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    #[test]
    #[expected_failure(abort_code = bounty::EIntelRegionMismatch)]
    fun test_resubmit_intel_proof_wrong_region() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let valid_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        setup_rejected_proof(&mut scenario, &mut bounty_obj, &meta, &valid_intel, &clock);

        let bad_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 99, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::resubmit_intel_proof(
            &mut bounty_obj, &meta, &bad_intel,
            b"https://proof.example.com/v2".to_string(),
            b"Updated".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    #[test]
    #[expected_failure(abort_code = bounty::ENotReporter)]
    fun test_resubmit_intel_proof_not_reporter() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let valid_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        setup_rejected_proof(&mut scenario, &mut bounty_obj, &meta, &valid_intel, &clock);

        let bad_intel = intel::create_intel_for_testing(
            OTHER_HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::resubmit_intel_proof(
            &mut bounty_obj, &meta, &bad_intel,
            b"https://proof.example.com/v2".to_string(),
            b"Updated".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    #[test]
    #[expected_failure(abort_code = bounty::EMetaBountyMismatch)]
    fun test_resubmit_intel_proof_meta_mismatch() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let valid_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        setup_rejected_proof(&mut scenario, &mut bounty_obj, &meta, &valid_intel, &clock);

        let wrong_meta = bounty::create_meta_for_testing(
            object::id_from_address(@0xDEAD), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );

        ts::next_tx(&mut scenario, HUNTER);
        bounty::resubmit_intel_proof(
            &mut bounty_obj, &wrong_meta, &valid_intel,
            b"https://proof.example.com/v2".to_string(),
            b"Updated".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable
    }

    // ═══════════════════════════════════════════════
    // Attack path — auto_approve bypass blocked
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_auto_approve_bypass_blocked() {
        // Attack scenario: hunter tries to submit proof with mismatched intel,
        // hoping to later auto_approve without verifier validation.
        // The wrapper gate blocks at submit_intel_proof, so auto_approve
        // can never be reached with invalid intel.
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );

        // Hunter has a WRECKAGE intel (type 2) — does NOT match bounty criteria
        let mismatched_intel = intel::create_intel_for_testing(
            HUNTER, 2, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        // Attempt to submit proof with mismatched intel → BLOCKED
        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &mismatched_intel,
            b"https://proof.example.com/fake".to_string(),
            b"Pretending this wreckage is a resource".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable — wrapper aborts before bounty_escrow is called
    }
}
