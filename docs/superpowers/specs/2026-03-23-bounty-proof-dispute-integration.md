# Bounty Proof/Dispute Integration Spec

## Context

Bounty Escrow Protocol upgraded to v3, adding a complete Proof/Dispute Resolution system (submit → review → reject/resubmit → dispute → resolve, plus auto-approve on timeout). Explorer Hub's `bounty.move` wrapper needs to integrate the subset that requires domain-specific validation.

### Security Motivation

`auto_approve_proof` bypasses `verify_and_approve` entirely — it's a passive timeout path that never calls intel validation. If `submit_proof` doesn't enforce intel matching at the entry point, a hunter can:

1. `submit_proof` with a mismatched IntelReport (wrong type/region)
2. Wait for review period to expire (verifier offline/busy)
3. Call `auto_approve_proof`
4. Claim reward — no intel validation ever executed

Both `submit_proof` and `resubmit_proof` must enforce full intel validation because both are entry points to the auto-approve path.

## Scope

**In scope:** Two new functions in `frontier_explorer_hub::bounty` + 12 tests.

**Out of scope (tracked in progress.md):**
- Indexer: handle 6 new proof/dispute events from bounty_escrow
- Frontend UI: proof status display + action buttons on bounty detail page
- Frontend PTB builders: proof/dispute operations

## Design

### New Functions

Add to `frontier_explorer_hub/sources/bounty.move`:

```move
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

### Validation Logic

Reuses existing `validate_intel_match` (no changes needed):
1. `intel.reporter == hunter` — ownership (error 102: ENotReporter)
2. `intel.intel_type` in `meta.intel_types_wanted` — type match (error 100: EIntelTypeMismatch)
3. `intel.location` in `meta.target_region` — region match (error 101: EIntelRegionMismatch)

**Note on `ctx.sender()` vs explicit `hunter` parameter:** In `verify_and_approve`, `hunter` is an explicit parameter because the *verifier* calls on behalf of a hunter. In `submit_intel_proof` / `resubmit_intel_proof`, the hunter *is* the tx sender (consistent with bounty_escrow's `submit_proof` which uses `ctx.sender()`). This is a deliberate design difference, not a unification target.

**Precondition on `resubmit_proof`:** bounty_escrow enforces `proof.status == proof_rejected` before allowing resubmission. The wrapper does not need to duplicate this check — it aborts upstream if the precondition is not met.

### No New Structs, Events, or Error Codes

- Validation errors use existing codes 100–103
- Proof/dispute events emitted by bounty_escrow (not the wrapper)
- No new structs needed

### Functions NOT Wrapped (direct call to bounty_escrow)

| Function | Reason |
|----------|--------|
| `reject_proof` | Verifier action, no intel-specific invariant |
| `dispute_rejection` | Hunter generic action |
| `resolve_dispute` | Creator action, creator identity structurally guaranteed |
| `auto_approve_proof` | Safe — submit_proof already validated intel at entry |
| `set_review_period` | Creator check in bounty_escrow sufficient, no bypass path |

## Tests (12 total)

### Happy Path
1. `test_submit_intel_proof_success` — valid intel, delegate succeeds
2. `test_resubmit_intel_proof_success` — after rejection, resubmit with valid intel
3. `test_submit_then_auto_approve_e2e` — submit with valid intel → advance clock past review period → `auto_approve_proof` succeeds (positive e2e for the legitimate auto-approve path)

### Submit Validation Failures
4. `test_submit_intel_proof_wrong_type` — intel type mismatch → abort 100
5. `test_submit_intel_proof_wrong_region` — region mismatch → abort 101
6. `test_submit_intel_proof_not_reporter` — reporter ≠ hunter → abort 102
7. `test_submit_intel_proof_meta_mismatch` — meta.bounty_id ≠ bounty → abort 103

### Resubmit Validation Failures (symmetric with submit)
8. `test_resubmit_intel_proof_wrong_type` — resubmit with wrong intel type → abort 100
9. `test_resubmit_intel_proof_wrong_region` — resubmit with wrong region → abort 101
10. `test_resubmit_intel_proof_not_reporter` — resubmit from different hunter → abort 102
11. `test_resubmit_intel_proof_meta_mismatch` — resubmit with wrong meta → abort 103

### Attack Path (Monkey Test)
12. `test_auto_approve_bypass_blocked` — hunter attempts `submit_intel_proof` with mismatched intel → wrapper aborts at entry gate, confirming auto_approve path cannot be reached with invalid intel
