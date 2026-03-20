module frontier_explorer_hub::bounty {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::intel;

    // ═══════════════════════════════════════════════
    // Error codes (mirrored from admin for abort origin)
    // ═══════════════════════════════════════════════

    const ENotReporter: u64 = 4;
    const EBountyNotOpen: u64 = 14;
    const EBountyExpired: u64 = 15;
    const EBountyNotExpired: u64 = 16;
    const EBountyTypeMismatch: u64 = 17;
    const EBountyRegionMismatch: u64 = 18;
    const EZeroReward: u64 = 23;
    const EDeadlineInPast: u64 = 24;
    const EBountyNotCompleted: u64 = 25;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct IntelSubmission has store, drop, copy {
        intel_id: ID,
        submitter: address,
    }

    public struct BountyRequest has key {
        id: UID,
        requester: address,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
        reward_amount: u64,
        escrow: Balance<SUI>,
        deadline: u64,
        status: u8,
        submissions: vector<IntelSubmission>,
    }

    public struct BountyCreatedEvent has copy, drop {
        bounty_id: ID,
        requester: address,
        target_region: intel::GridCell,
        reward_amount: u64,
        deadline: u64,
    }

    public struct BountyCompletedEvent has copy, drop {
        bounty_id: ID,
        explorer: address,
        intel_id: ID,
        reward_amount: u64,
    }

    // ═══════════════════════════════════════════════
    // Core functions
    // ═══════════════════════════════════════════════

    public fun create_bounty(
        payment: Coin<SUI>,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
        deadline: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(payment.value() > 0, EZeroReward);
        assert!(deadline > clock.timestamp_ms(), EDeadlineInPast);

        let reward_amount = payment.value();
        let bounty = BountyRequest {
            id: object::new(ctx),
            requester: ctx.sender(),
            target_region,
            intel_types_wanted,
            reward_amount,
            escrow: payment.into_balance(),
            deadline,
            status: admin::bounty_open(),
            submissions: vector[],
        };

        event::emit(BountyCreatedEvent {
            bounty_id: object::id(&bounty),
            requester: ctx.sender(),
            target_region,
            reward_amount,
            deadline,
        });

        transfer::share_object(bounty);
    }

    public fun submit_for_bounty(
        bounty: &mut BountyRequest,
        intel: &intel::IntelReport,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(bounty.status == admin::bounty_open(), EBountyNotOpen);
        assert!(clock.timestamp_ms() <= bounty.deadline, EBountyExpired);
        assert!(ctx.sender() == intel.reporter(), ENotReporter);

        let it = intel.intel_type();
        assert!(vector::contains(&bounty.intel_types_wanted, &it), EBountyTypeMismatch);
        assert!(intel::is_in_region(&intel.location(), intel::region_id(&bounty.target_region)), EBountyRegionMismatch);

        let intel_id = object::id(intel);
        bounty.submissions.push_back(IntelSubmission {
            intel_id,
            submitter: ctx.sender(),
        });

        bounty.status = admin::bounty_completed();

        let amount = bounty.escrow.value();
        let reward_bal = balance::split(&mut bounty.escrow, amount);
        let reward_amount = amount;
        transfer::public_transfer(coin::from_balance(reward_bal, ctx), ctx.sender());

        event::emit(BountyCompletedEvent {
            bounty_id: object::id(bounty),
            explorer: ctx.sender(),
            intel_id,
            reward_amount,
        });
    }

    public fun refund_expired_bounty(
        bounty: BountyRequest,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(clock.timestamp_ms() > bounty.deadline, EBountyNotExpired);
        assert!(bounty.status == admin::bounty_open(), EBountyNotOpen);

        let BountyRequest {
            id,
            requester,
            target_region: _,
            intel_types_wanted: _,
            reward_amount: _,
            escrow,
            deadline: _,
            status: _,
            submissions: _,
        } = bounty;

        object::delete(id);
        transfer::public_transfer(coin::from_balance(escrow, ctx), requester);
    }

    public fun cleanup_completed_bounty(bounty: BountyRequest) {
        assert!(bounty.status == admin::bounty_completed(), EBountyNotCompleted);

        let BountyRequest {
            id,
            requester: _,
            target_region: _,
            intel_types_wanted: _,
            reward_amount: _,
            escrow,
            deadline: _,
            status: _,
            submissions: _,
        } = bounty;

        object::delete(id);
        balance::destroy_zero(escrow);
    }

    // ═══════════════════════════════════════════════
    // Accessor functions
    // ═══════════════════════════════════════════════

    public fun requester(bounty: &BountyRequest): address { bounty.requester }
    public fun reward_amount(bounty: &BountyRequest): u64 { bounty.reward_amount }
    public fun deadline(bounty: &BountyRequest): u64 { bounty.deadline }
    public fun status(bounty: &BountyRequest): u8 { bounty.status }
    public fun escrow_value(bounty: &BountyRequest): u64 { bounty.escrow.value() }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_bounty_for_testing(
        payment: Coin<SUI>,
        target_region: intel::GridCell,
        intel_types_wanted: vector<u8>,
        deadline: u64,
        ctx: &mut TxContext,
    ): BountyRequest {
        let reward_amount = payment.value();
        BountyRequest {
            id: object::new(ctx),
            requester: ctx.sender(),
            target_region,
            intel_types_wanted,
            reward_amount,
            escrow: payment.into_balance(),
            deadline,
            status: admin::bounty_open(),
            submissions: vector[],
        }
    }

    #[test_only]
    public fun destroy_bounty_for_testing(bounty: BountyRequest) {
        let BountyRequest {
            id,
            requester: _,
            target_region: _,
            intel_types_wanted: _,
            reward_amount: _,
            escrow,
            deadline: _,
            status: _,
            submissions: _,
        } = bounty;
        object::delete(id);
        balance::destroy_for_testing(escrow);
    }
}
