/// Thin wrapper over `bounty_escrow` — adds intel-specific metadata
/// and verification logic (region/type matching, anti-frontrunning).
///
/// Only wraps operations with Explorer Hub domain logic:
/// - create_intel_bounty: escrow creation + IntelBountyMeta
/// - verify_and_approve: intel match validation + approval
///
/// For claim, reward, cancel, expire, abandon — call bounty_escrow
/// entry functions directly (no domain logic needed).
module frontier_explorer_hub::bounty {
    use std::string::String;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    use bounty_escrow::bounty::{Self, Bounty};
    use bounty_escrow::verifier::VerifierCap;
    use frontier_explorer_hub::intel;

    // ═══════════════════════════════════════════════
    // Error codes (local for abort origin matching)
    // ═══════════════════════════════════════════════

    const EIntelTypeMismatch: u64 = 100;
    const EIntelRegionMismatch: u64 = 101;
    const ENotReporter: u64 = 102;
    const EMetaBountyMismatch: u64 = 103;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    /// Intel-specific metadata linked to a bounty_escrow::Bounty<SUI>.
    /// Shared object — stores the domain criteria for intel matching.
    public struct IntelBountyMeta has key {
        id: UID,
        bounty_id: ID,
        creator: address,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
    }

    // ═══════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════

    public struct IntelBountyCreatedEvent has copy, drop {
        bounty_id: ID,
        meta_id: ID,
        creator: address,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
    }

    public struct IntelVerifiedEvent has copy, drop {
        bounty_id: ID,
        hunter: address,
        intel_id: ID,
    }

    // ═══════════════════════════════════════════════
    // Create
    // ═══════════════════════════════════════════════

    /// Create an intel bounty backed by bounty_escrow.
    /// Atomically creates the escrow Bounty<SUI> + IntelBountyMeta in one tx.
    public fun create_intel_bounty(
        title: String,
        description: String,
        coin: Coin<SUI>,
        reward_amount: u64,
        required_stake: u64,
        max_claims: u64,
        deadline: u64,
        grace_period: u64,
        cleanup_reward_bps: u16,
        verifier_addr: address,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (change, bounty_id) = bounty::create_bounty<SUI>(
            title, description, coin,
            reward_amount, required_stake, max_claims,
            deadline, grace_period, cleanup_reward_bps,
            verifier_addr, clock, ctx,
        );

        let meta = IntelBountyMeta {
            id: object::new(ctx),
            bounty_id,
            creator: ctx.sender(),
            target_region,
            intel_types_wanted,
        };

        event::emit(IntelBountyCreatedEvent {
            bounty_id,
            meta_id: object::id(&meta),
            creator: ctx.sender(),
            target_region,
            intel_types_wanted,
        });

        transfer::share_object(meta);

        if (coin::value(&change) > 0) {
            transfer::public_transfer(change, ctx.sender());
        } else {
            coin::destroy_zero(change);
        };
    }

    // ═══════════════════════════════════════════════
    // Verify + Approve
    // ═══════════════════════════════════════════════

    /// Verifier validates intel matches bounty criteria, then approves hunter.
    /// Anti-frontrunning: intel reporter must equal hunter address.
    public fun verify_and_approve(
        bounty_obj: &mut Bounty<SUI>,
        meta: &IntelBountyMeta,
        intel: &intel::IntelReport,
        hunter: address,
        cap: &VerifierCap,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Meta must belong to this bounty
        assert!(meta.bounty_id == object::id(bounty_obj), EMetaBountyMismatch);

        // Validate intel match
        validate_intel_match(meta, intel, hunter);

        // Delegate approval to bounty_escrow
        bounty::approve_hunter<SUI>(bounty_obj, hunter, cap, clock, ctx);

        event::emit(IntelVerifiedEvent {
            bounty_id: meta.bounty_id,
            hunter,
            intel_id: object::id(intel),
        });
    }

    // ═══════════════════════════════════════════════
    // Internal validation
    // ═══════════════════════════════════════════════

    /// Validates intel matches bounty metadata criteria.
    fun validate_intel_match(
        meta: &IntelBountyMeta,
        intel: &intel::IntelReport,
        hunter: address,
    ) {
        // Anti-frontrunning: reporter must be the hunter
        assert!(intel::reporter(intel) == hunter, ENotReporter);

        // Intel type must be in the wanted list
        let it = intel::intel_type(intel);
        assert!(vector::contains(&meta.intel_types_wanted, &it), EIntelTypeMismatch);

        // Intel location must be in target region
        assert!(
            intel::is_in_region(
                &intel::location(intel),
                intel::region_id(&meta.target_region),
            ),
            EIntelRegionMismatch,
        );
    }

    // ═══════════════════════════════════════════════
    // Accessors
    // ═══════════════════════════════════════════════

    public fun meta_bounty_id(meta: &IntelBountyMeta): ID { meta.bounty_id }
    public fun meta_creator(meta: &IntelBountyMeta): address { meta.creator }
    public fun meta_target_region(meta: &IntelBountyMeta): intel::GridCell { meta.target_region }
    public fun meta_intel_types_wanted(meta: &IntelBountyMeta): vector<u8> { meta.intel_types_wanted }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_meta_for_testing(
        bounty_id: ID,
        creator: address,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
        ctx: &mut TxContext,
    ): IntelBountyMeta {
        IntelBountyMeta {
            id: object::new(ctx),
            bounty_id,
            creator,
            target_region,
            intel_types_wanted,
        }
    }

    #[test_only]
    public fun destroy_meta_for_testing(meta: IntelBountyMeta) {
        let IntelBountyMeta {
            id, bounty_id: _, creator: _, target_region: _, intel_types_wanted: _,
        } = meta;
        object::delete(id);
    }

    /// Expose validation logic for unit testing without needing a real Bounty object.
    #[test_only]
    public fun validate_intel_match_for_testing(
        meta: &IntelBountyMeta,
        intel: &intel::IntelReport,
        hunter: address,
    ) {
        validate_intel_match(meta, intel, hunter);
    }
}
