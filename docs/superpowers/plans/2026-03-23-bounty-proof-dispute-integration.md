# Bounty Proof/Dispute Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `submit_intel_proof` and `resubmit_intel_proof` to Explorer Hub's bounty wrapper, enforcing intel validation at the proof entry gate to prevent auto-approve bypass attacks.

**Architecture:** Two new `public fun` functions in `frontier_explorer_hub::bounty` that validate intel matching (reusing existing `validate_intel_match`) then delegate to `bounty_escrow::bounty::submit_proof` / `resubmit_proof`. Tests use `test_scenario` with real shared `Bounty<SUI>` objects since bounty_escrow's proof functions check `active_hunter_stakes`.

**Tech Stack:** Sui Move (2024 edition), bounty_escrow v3 dependency

**Spec:** `docs/superpowers/specs/2026-03-23-bounty-proof-dispute-integration.md`

---

### Task 1: Add `submit_intel_proof` and `resubmit_intel_proof` to wrapper

**Files:**
- Modify: `move/frontier_explorer_hub/sources/bounty.move` (after `verify_and_approve`, before Accessors section ~line 174)

- [ ] **Step 1: Update module doc comment**

```move
// Replace lines 1-9 with:
/// Thin wrapper over `bounty_escrow` — adds intel-specific metadata
/// and verification logic (region/type matching, anti-frontrunning).
///
/// Only wraps operations with Explorer Hub domain logic:
/// - create_intel_bounty: escrow creation + IntelBountyMeta
/// - verify_and_approve: intel match validation + approval
/// - submit_intel_proof / resubmit_intel_proof: intel validation at proof entry gate
///   (prevents auto_approve_proof bypass — see spec for attack path)
///
/// For claim, reward, cancel, expire, abandon, reject_proof, dispute_rejection,
/// resolve_dispute, auto_approve_proof, set_review_period — call bounty_escrow
/// entry functions directly (no domain logic needed).
```

- [ ] **Step 2: Add the two functions**

Insert after `verify_and_approve` (after line 145, before the Internal validation section):

```move
    // ═══════════════════════════════════════════════
    // Proof Submission (intel-validated entry gate)
    // ═══════════════════════════════════════════════

    /// Submit proof of intel bounty completion.
    /// Validates intel matches bounty criteria before delegating to bounty_escrow.
    /// This is a security gate: auto_approve_proof bypasses verify_and_approve,
    /// so intel validation MUST happen here at the entry point.
    /// Uses ctx.sender() as hunter (hunter is the tx sender for proof submission).
    public fun submit_intel_proof(
        bounty_obj: &mut Bounty<SUI>,
        meta: &IntelBountyMeta,
        intel: &intel::IntelReport,
        proof_url: String,
        proof_description: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(meta.bounty_id == object::id(bounty_obj), EMetaBountyMismatch);
        validate_intel_match(meta, intel, ctx.sender());
        bounty::submit_proof(bounty_obj, proof_url, proof_description, clock, ctx);
    }

    /// Resubmit proof after rejection. Same intel validation as submit_intel_proof.
    /// bounty_escrow enforces proof.status == proof_rejected and has_resubmitted == false.
    public fun resubmit_intel_proof(
        bounty_obj: &mut Bounty<SUI>,
        meta: &IntelBountyMeta,
        intel: &intel::IntelReport,
        proof_url: String,
        proof_description: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(meta.bounty_id == object::id(bounty_obj), EMetaBountyMismatch);
        validate_intel_match(meta, intel, ctx.sender());
        bounty::resubmit_proof(bounty_obj, proof_url, proof_description, clock, ctx);
    }
```

- [ ] **Step 3: Build to verify compilation**

Run: `cd move/frontier_explorer_hub && sui move build 2>&1 | tail -5`
Expected: Build succeeds (warnings about self_transfer are OK)

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `sui move test 2>&1 | tail -5`
Expected: `Test result: OK. Total tests: 45; passed: 45; failed: 0`

- [ ] **Step 5: Commit**

```bash
git add move/frontier_explorer_hub/sources/bounty.move
git commit -m "feat(bounty): add submit_intel_proof + resubmit_intel_proof wrappers

Intel validation at proof entry gate prevents auto_approve_proof bypass.
Both functions validate intel type/region/reporter before delegating
to bounty_escrow::submit_proof / resubmit_proof."
```

---

### Task 2: Happy path tests

**Files:**
- Modify: `move/frontier_explorer_hub/sources/tests/bounty_tests.move`

**Context:** These tests need `test_scenario` with real shared `Bounty<SUI>` objects because `bounty_escrow::submit_proof` checks `active_hunter_stakes`. The pattern:
1. Creator creates bounty via `bounty::create<SUI>()` entry function
2. `ts::next_tx` → `ts::take_shared<Bounty<SUI>>`
3. Hunter claims with stake
4. Hunter calls `submit_intel_proof` / `resubmit_intel_proof`

Addresses: `CREATOR = @0xA`, `VERIFIER = @0xB`, `HUNTER = @0xC`
Clock: `BASE_TIME = 1_000_000_000`, `DEADLINE = BASE_TIME + 86_400_000`

- [ ] **Step 1: Add test constants and setup helper at top of module**

After the existing `use` statements (line 6), add:

```move
    use sui::test_scenario::{Self as ts};
    use sui::coin;
    use sui::sui::SUI;
    use bounty_escrow::bounty::{Self as be_bounty, Bounty};
    use bounty_escrow::verifier::VerifierCap;

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
```

- [ ] **Step 2: Write `test_submit_intel_proof_success`**

```move
    #[test]
    fun test_submit_intel_proof_success() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);

        // Hunter claims
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        // Create matching meta and intel
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8, 1u8],
            ts::ctx(&mut scenario),
        );
        let intel_report = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        // Submit proof as hunter
        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/report1".to_string(),
            b"Found resource deposit at sector 10,20,30".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        // Verify proof was submitted
        assert!(be_bounty::has_proof(&bounty_obj, HUNTER));

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        ts::return_shared(bounty_obj);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
```

- [ ] **Step 3: Write `test_resubmit_intel_proof_success`**

This test needs the full cycle: submit → reject → resubmit.

```move
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

        // Verifier rejects (call bounty_escrow directly)
        ts::next_tx(&mut scenario, VERIFIER_ADDR);
        let cap = ts::take_from_address<VerifierCap>(&scenario, VERIFIER_ADDR);
        be_bounty::reject_proof<SUI>(
            &mut bounty_obj, HUNTER,
            b"Insufficient evidence".to_string(),
            &cap, &clock, ts::ctx(&mut scenario),
        );
        ts::return_to_address(VERIFIER_ADDR, cap);

        // Hunter resubmits via wrapper
        ts::next_tx(&mut scenario, HUNTER);
        bounty::resubmit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/v2".to_string(),
            b"Updated with better evidence".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        // Verify proof was resubmitted
        assert!(be_bounty::has_proof(&bounty_obj, HUNTER));

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        ts::return_shared(bounty_obj);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
```

- [ ] **Step 4: Write `test_submit_then_auto_approve_e2e`**

Positive e2e: submit with valid intel → advance clock past review period → auto_approve succeeds.

```move
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

        // Submit proof via wrapper (intel validated here)
        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &intel_report,
            b"https://proof.example.com/report".to_string(),
            b"Resource deposit confirmed".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        // Advance clock past default review period (3 days = 259_200_000 ms)
        clock::set_for_testing(&mut clock, BASE_TIME + 259_200_001);

        // Auto-approve (call bounty_escrow directly — no wrapper needed)
        ts::next_tx(&mut scenario, HUNTER);
        be_bounty::auto_approve_proof<SUI>(
            &mut bounty_obj, &clock, ts::ctx(&mut scenario),
        );

        // Verify hunter is now approved (auto_approve adds to approved_hunters,
        // completed_claims only increments at claim_reward payout)
        assert!(be_bounty::proof_status<SUI>(&bounty_obj, HUNTER) == 11); // proof_approved

        intel::destroy_intel_for_testing(intel_report);
        bounty::destroy_meta_for_testing(meta);
        ts::return_shared(bounty_obj);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
```

- [ ] **Step 5: Build and run tests**

Run: `sui move test --filter proof 2>&1 | tail -10`
Expected: 3 new tests pass

- [ ] **Step 6: Commit**

```bash
git add move/frontier_explorer_hub/sources/tests/bounty_tests.move
git commit -m "test(bounty): happy path tests for submit/resubmit intel proof + auto-approve e2e"
```

---

### Task 3: Submit validation failure tests

**Files:**
- Modify: `move/frontier_explorer_hub/sources/tests/bounty_tests.move`

- [ ] **Step 1: Write 4 submit failure tests**

```move
    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_submit_intel_proof_wrong_type() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        // Meta wants type 0,1 — intel has type 2
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

        // Meta wants region 42 — intel has region 99
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

        // Intel reporter is OTHER_HUNTER, but tx sender is HUNTER
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

        // Meta points to a different bounty ID
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
```

- [ ] **Step 2: Run tests**

Run: `sui move test --filter submit_intel_proof 2>&1 | tail -10`
Expected: 4 new failure tests pass (+ 1 success from Task 2)

- [ ] **Step 3: Commit**

```bash
git add move/frontier_explorer_hub/sources/tests/bounty_tests.move
git commit -m "test(bounty): submit_intel_proof validation failure tests (type/region/reporter/meta)"
```

---

### Task 4: Resubmit validation failure tests

**Files:**
- Modify: `move/frontier_explorer_hub/sources/tests/bounty_tests.move`

**Context:** Each resubmit test needs the full cycle: claim → submit (valid) → reject → resubmit (invalid). Extract a helper to reduce duplication.

- [ ] **Step 1: Add resubmit setup helper**

```move
    /// Sets up a bounty where hunter has submitted proof and been rejected,
    /// ready for resubmit testing.
    fun setup_rejected_proof(
        scenario: &mut ts::Scenario,
        bounty_obj: &mut Bounty<SUI>,
        meta: &bounty::IntelBountyMeta,
        intel: &intel::IntelReport,
        clock: &clock::Clock,
    ) {
        // Submit valid proof
        ts::next_tx(scenario, HUNTER);
        bounty::submit_intel_proof(
            bounty_obj, meta, intel,
            b"https://proof.example.com/v1".to_string(),
            b"Initial submission".to_string(),
            clock, ts::ctx(scenario),
        );

        // Verifier rejects
        ts::next_tx(scenario, VERIFIER_ADDR);
        let cap = ts::take_from_address<VerifierCap>(scenario, VERIFIER_ADDR);
        be_bounty::reject_proof<SUI>(
            bounty_obj, HUNTER,
            b"Insufficient evidence".to_string(),
            &cap, clock, ts::ctx(scenario),
        );
        ts::return_to_address(VERIFIER_ADDR, cap);
    }
```

- [ ] **Step 2: Write 4 resubmit failure tests**

```move
    #[test]
    #[expected_failure(abort_code = bounty::EIntelTypeMismatch)]
    fun test_resubmit_intel_proof_wrong_type() {
        let mut scenario = ts::begin(CREATOR);
        let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
        clock::set_for_testing(&mut clock, BASE_TIME);

        let mut bounty_obj = setup_bounty_for_proof_tests(&mut scenario, &clock);
        hunter_claim(&mut scenario, &mut bounty_obj, HUNTER, &clock);

        // Valid meta + intel for initial submit
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let valid_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        setup_rejected_proof(&mut scenario, &mut bounty_obj, &meta, &valid_intel, &clock);

        // Resubmit with wrong-type intel
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

        // Resubmit with wrong-region intel
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

        // Resubmit with intel from different reporter
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

        // Valid meta for initial submit
        let region = intel::new_grid_cell(42, 10, 20, 30, 3);
        let meta = bounty::create_meta_for_testing(
            object::id(&bounty_obj), HUNTER, region, vector[0u8],
            ts::ctx(&mut scenario),
        );
        let valid_intel = intel::create_intel_for_testing(
            HUNTER, 0, 5, 42, 10, 20, 30, 3, 0, &clock, ts::ctx(&mut scenario),
        );

        setup_rejected_proof(&mut scenario, &mut bounty_obj, &meta, &valid_intel, &clock);

        // Wrong meta for resubmit
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
```

- [ ] **Step 3: Run tests**

Run: `sui move test --filter resubmit_intel_proof 2>&1 | tail -10`
Expected: 4 new failure tests + 1 success from Task 2

- [ ] **Step 4: Commit**

```bash
git add move/frontier_explorer_hub/sources/tests/bounty_tests.move
git commit -m "test(bounty): resubmit_intel_proof validation failure tests (symmetric with submit)"
```

---

### Task 5: Attack path monkey test

**Files:**
- Modify: `move/frontier_explorer_hub/sources/tests/bounty_tests.move`

- [ ] **Step 1: Write attack path test**

```move
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

        // Meta wants type 0 (RESOURCE)
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
        // Without this wrapper gate, hunter could submit, wait for review
        // period to expire, then call auto_approve_proof to get reward
        // without ever passing intel validation.
        ts::next_tx(&mut scenario, HUNTER);
        bounty::submit_intel_proof(
            &mut bounty_obj, &meta, &mismatched_intel,
            b"https://proof.example.com/fake".to_string(),
            b"Pretending this wreckage is a resource".to_string(),
            &clock, ts::ctx(&mut scenario),
        );

        abort 0 // unreachable — wrapper aborts before bounty_escrow is called
    }
```

- [ ] **Step 2: Run full test suite**

Run: `sui move test 2>&1 | tail -5`
Expected: `Test result: OK. Total tests: 57; passed: 57; failed: 0` (45 existing + 12 new)

- [ ] **Step 3: Commit**

```bash
git add move/frontier_explorer_hub/sources/tests/bounty_tests.move
git commit -m "test(bounty): monkey test — auto_approve bypass attack blocked at entry gate"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full build**

Run: `sui move build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 2: Full test suite**

Run: `sui move test 2>&1`
Expected: All 57 tests pass

- [ ] **Step 3: Update progress.md**

Add to Recently Completed:
```
- [2026-03-23] **Bounty Proof/Dispute Integration — submit_intel_proof + resubmit_intel_proof**
  - 2 new wrapper functions in bounty.move (intel validation at proof entry gate)
  - 12 new tests (3 happy path + 4 submit failures + 4 resubmit failures + 1 attack path monkey test)
  - Fixes: Move.toml path (5-level → 3-level), create_bounty → create_bounty_with_id
```
