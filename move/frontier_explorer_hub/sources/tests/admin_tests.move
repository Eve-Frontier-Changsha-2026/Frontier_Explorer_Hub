#[test_only]
module frontier_explorer_hub::admin_tests {
    use frontier_explorer_hub::admin;

    #[test]
    fun test_constants_valid() {
        // Intel types are sequential 0..3, count = 4
        assert!(admin::intel_resource() == 0);
        assert!(admin::intel_threat() == 1);
        assert!(admin::intel_wreckage() == 2);
        assert!(admin::intel_population() == 3);
        assert!(admin::intel_type_count() == 4);

        // Severity max
        assert!(admin::max_severity() == 10);

        // Visibility
        assert!(admin::vis_public() == 0);
        assert!(admin::vis_private() == 1);
        assert!(admin::vis_count() == 2);

        // Tiers
        assert!(admin::tier_free() == 0);
        assert!(admin::tier_premium() == 1);

        // Economic bounds relationships
        assert!(admin::min_reporter_share_bps() < admin::max_reporter_share_bps());
        assert!(admin::min_price_per_day() < admin::max_price_per_day());
        assert!(admin::min_submit_deposit() > 0);

        // Defaults within bounds
        assert!(admin::default_premium_price_per_day() >= admin::min_price_per_day());
        assert!(admin::default_premium_price_per_day() <= admin::max_price_per_day());
        assert!(admin::default_reporter_share_bps() >= admin::min_reporter_share_bps());
        assert!(admin::default_reporter_share_bps() <= admin::max_reporter_share_bps());

        // Batch limit
        assert!(admin::max_batch_size() == 20);
    }

    #[test]
    fun test_validation_helpers() {
        // Valid intel types
        assert!(admin::is_valid_intel_type(0));
        assert!(admin::is_valid_intel_type(3));
        assert!(!admin::is_valid_intel_type(4));
        assert!(!admin::is_valid_intel_type(255));

        // Valid severity
        assert!(admin::is_valid_severity(0));
        assert!(admin::is_valid_severity(10));
        assert!(!admin::is_valid_severity(11));

        // Valid visibility
        assert!(admin::is_valid_visibility(0));
        assert!(admin::is_valid_visibility(1));
        assert!(!admin::is_valid_visibility(2));
    }

    #[test]
    fun test_create_admin_cap() {
        let mut ctx = tx_context::dummy();
        let cap = admin::create_admin_cap_for_testing(&mut ctx);
        // AdminCap created successfully — transfer to avoid drop error
        transfer::public_transfer(cap, @0x1);
    }
}
