module frontier_explorer_hub::intel {
    use sui::coin::{Self, Coin};
    use sui::balance::{Balance};
    #[test_only]
    use sui::balance;
    use sui::sui::SUI;
    use sui::clock::Clock;
    use sui::event;

    use frontier_explorer_hub::admin;

    // ═══════════════════════════════════════════════
    // Error codes (mirrored from admin for abort origin)
    // ═══════════════════════════════════════════════

    const EInvalidSeverity: u64 = 0;
    const EInvalidVisibility: u64 = 1;
    const EInvalidIntelType: u64 = 2;
    const EInsufficientDeposit: u64 = 3;
    const ENotReporter: u64 = 4;
    const EIntelNotExpired: u64 = 5;
    const EBatchTooLarge: u64 = 19;

    // ═══════════════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════════════

    public struct GridCell has store, copy, drop {
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        zoom_level: u8,
    }

    public struct IntelReport has key {
        id: UID,
        reporter: address,
        location: GridCell,
        raw_location_hash: vector<u8>,
        intel_type: u8,
        severity: u8,
        timestamp: u64,
        expiry: u64,
        visibility: u8,
        deposit: Balance<SUI>,
    }

    public struct IntelParams has store, copy, drop {
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        zoom_level: u8,
        raw_location_hash: vector<u8>,
        intel_type: u8,
        severity: u8,
        expiry: u64,
        visibility: u8,
    }

    public struct IntelSubmittedEvent has copy, drop {
        intel_id: ID,
        reporter: address,
        location: GridCell,
        intel_type: u8,
        severity: u8,
        timestamp: u64,
        visibility: u8,
    }

    // ═══════════════════════════════════════════════
    // Constructors
    // ═══════════════════════════════════════════════

    public fun new_grid_cell(
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        zoom_level: u8,
    ): GridCell {
        GridCell { region_id, sector_x, sector_y, sector_z, zoom_level }
    }

    // ═══════════════════════════════════════════════
    // Core functions
    // ═══════════════════════════════════════════════

    public fun submit_intel(
        clock: &Clock,
        deposit: Coin<SUI>,
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        zoom_level: u8,
        raw_location_hash: vector<u8>,
        intel_type: u8,
        severity: u8,
        expiry: u64,
        visibility: u8,
        ctx: &mut TxContext,
    ) {
        assert!(admin::is_valid_intel_type(intel_type), EInvalidIntelType);
        assert!(admin::is_valid_severity(severity), EInvalidSeverity);
        assert!(admin::is_valid_visibility(visibility), EInvalidVisibility);
        assert!(deposit.value() >= admin::min_submit_deposit(), EInsufficientDeposit);

        let location = GridCell { region_id, sector_x, sector_y, sector_z, zoom_level };
        let timestamp = clock.timestamp_ms();

        let intel = IntelReport {
            id: object::new(ctx),
            reporter: ctx.sender(),
            location,
            raw_location_hash,
            intel_type,
            severity,
            timestamp,
            expiry,
            visibility,
            deposit: deposit.into_balance(),
        };

        event::emit(IntelSubmittedEvent {
            intel_id: object::id(&intel),
            reporter: ctx.sender(),
            location,
            intel_type,
            severity,
            timestamp,
            visibility,
        });

        transfer::share_object(intel);
    }

    public fun batch_submit(
        clock: &Clock,
        deposit: &mut Coin<SUI>,
        params: vector<IntelParams>,
        ctx: &mut TxContext,
    ) {
        let len = params.length();
        assert!(len <= admin::max_batch_size(), EBatchTooLarge);

        let per_deposit = admin::min_submit_deposit();
        let total_needed = per_deposit * len;
        assert!(deposit.value() >= total_needed, EInsufficientDeposit);

        let mut i = 0;
        while (i < len) {
            let p = &params[i];
            assert!(admin::is_valid_intel_type(p.intel_type), EInvalidIntelType);
            assert!(admin::is_valid_severity(p.severity), EInvalidSeverity);
            assert!(admin::is_valid_visibility(p.visibility), EInvalidVisibility);

            let split_coin = deposit.split(per_deposit, ctx);
            let location = GridCell {
                region_id: p.region_id,
                sector_x: p.sector_x,
                sector_y: p.sector_y,
                sector_z: p.sector_z,
                zoom_level: p.zoom_level,
            };
            let timestamp = clock.timestamp_ms();

            let intel = IntelReport {
                id: object::new(ctx),
                reporter: ctx.sender(),
                location,
                raw_location_hash: p.raw_location_hash,
                intel_type: p.intel_type,
                severity: p.severity,
                timestamp,
                expiry: p.expiry,
                visibility: p.visibility,
                deposit: split_coin.into_balance(),
            };

            event::emit(IntelSubmittedEvent {
                intel_id: object::id(&intel),
                reporter: ctx.sender(),
                location,
                intel_type: p.intel_type,
                severity: p.severity,
                timestamp,
                visibility: p.visibility,
            });

            transfer::share_object(intel);
            i = i + 1;
        };
    }

    public fun expire_intel(
        intel: IntelReport,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(clock.timestamp_ms() >= intel.expiry, EIntelNotExpired);

        let IntelReport {
            id,
            reporter,
            location: _,
            raw_location_hash: _,
            intel_type: _,
            severity: _,
            timestamp: _,
            expiry: _,
            visibility: _,
            deposit,
        } = intel;

        object::delete(id);
        let refund = coin::from_balance(deposit, ctx);
        transfer::public_transfer(refund, reporter);
    }

    public fun update_visibility(
        intel: &mut IntelReport,
        new_visibility: u8,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == intel.reporter, ENotReporter);
        assert!(admin::is_valid_visibility(new_visibility), EInvalidVisibility);
        intel.visibility = new_visibility;
    }

    public fun is_in_region(cell: &GridCell, region_id: u64): bool {
        cell.region_id == region_id
    }

    // ═══════════════════════════════════════════════
    // Accessor functions — IntelReport
    // ═══════════════════════════════════════════════

    public fun reporter(intel: &IntelReport): address { intel.reporter }
    public fun location(intel: &IntelReport): GridCell { intel.location }
    public fun raw_location_hash(intel: &IntelReport): vector<u8> { intel.raw_location_hash }
    public fun intel_type(intel: &IntelReport): u8 { intel.intel_type }
    public fun severity(intel: &IntelReport): u8 { intel.severity }
    public fun timestamp(intel: &IntelReport): u64 { intel.timestamp }
    public fun expiry(intel: &IntelReport): u64 { intel.expiry }
    public fun visibility(intel: &IntelReport): u8 { intel.visibility }
    public fun deposit_value(intel: &IntelReport): u64 { intel.deposit.value() }

    // ═══════════════════════════════════════════════
    // Accessor functions — GridCell
    // ═══════════════════════════════════════════════

    public fun region_id(cell: &GridCell): u64 { cell.region_id }
    public fun sector_x(cell: &GridCell): u64 { cell.sector_x }
    public fun sector_y(cell: &GridCell): u64 { cell.sector_y }
    public fun sector_z(cell: &GridCell): u64 { cell.sector_z }
    public fun zoom_level(cell: &GridCell): u8 { cell.zoom_level }

    // ═══════════════════════════════════════════════
    // IntelParams constructor
    // ═══════════════════════════════════════════════

    public fun new_intel_params(
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        zoom_level: u8,
        raw_location_hash: vector<u8>,
        intel_type: u8,
        severity: u8,
        expiry: u64,
        visibility: u8,
    ): IntelParams {
        IntelParams {
            region_id, sector_x, sector_y, sector_z, zoom_level,
            raw_location_hash, intel_type, severity, expiry, visibility,
        }
    }

    // ═══════════════════════════════════════════════
    // Test helpers
    // ═══════════════════════════════════════════════

    #[test_only]
    public fun create_intel_for_testing(
        reporter: address,
        intel_type: u8,
        severity: u8,
        region_id: u64,
        sector_x: u64,
        sector_y: u64,
        sector_z: u64,
        zoom_level: u8,
        deposit_value: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): IntelReport {
        IntelReport {
            id: object::new(ctx),
            reporter,
            location: GridCell { region_id, sector_x, sector_y, sector_z, zoom_level },
            raw_location_hash: vector[],
            intel_type,
            severity,
            timestamp: clock.timestamp_ms(),
            expiry: clock.timestamp_ms() + 86400_000,
            visibility: 0,
            deposit: balance::create_for_testing<SUI>(deposit_value),
        }
    }

    #[test_only]
    public fun destroy_intel_for_testing(intel: IntelReport) {
        let IntelReport {
            id,
            reporter: _,
            location: _,
            raw_location_hash: _,
            intel_type: _,
            severity: _,
            timestamp: _,
            expiry: _,
            visibility: _,
            deposit,
        } = intel;
        object::delete(id);
        balance::destroy_for_testing(deposit);
    }

    #[test_only]
    public fun share_intel_for_testing(intel: IntelReport) {
        transfer::share_object(intel);
    }
}
