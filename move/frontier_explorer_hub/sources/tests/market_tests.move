#[test_only]
module frontier_explorer_hub::market_tests {
    use sui::clock;
    use sui::coin;
    use sui::test_scenario::{Self as ts};

    use frontier_explorer_hub::intel;
    use frontier_explorer_hub::market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const OTHER: address = @0xC;

    // ═══════════════════════════════════════════════
    // list_intel tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_list_intel_success() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000, // 0.1 SUI
            5,           // max 5 buyers
            clock.timestamp_ms() + 86400_000, // 1 day
            vector[0u8, 1u8, 2u8], // encrypted payload
            &config,
            &clock,
            scenario.ctx(),
        );

        // cleanup
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ENotReporter)]
    fun test_list_intel_not_reporter() {
        let mut scenario = ts::begin(OTHER); // OTHER is not the reporter
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1, // reporter = SELLER
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EPriceTooLow)]
    fun test_list_intel_price_too_low() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            1, // price too low (min = 0.01 SUI = 10_000_000)
            5,
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EPayloadTooLarge)]
    fun test_list_intel_payload_too_large() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        // Create payload > 4096 bytes
        let mut big_payload = vector[];
        let mut i = 0;
        while (i < 4097) {
            big_payload.push_back(0u8);
            i = i + 1;
        };

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            big_payload,
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EIntelExpired)]
    fun test_list_intel_intel_expired() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(200_000_000); // advance past intel expiry

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        // intel expiry = clock + 86400_000, advance clock past it
        clock.increment_for_testing(86_500_000);

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EMaxBuyersExceeded)]
    fun test_list_intel_max_buyers_exceeded() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000,
            101, // exceeds DEFAULT_MAX_BUYERS (100)
            clock.timestamp_ms() + 86400_000,
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingExpiryInPast)]
    fun test_list_intel_expiry_in_past() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        // Advance clock so expiry can be in past
        clock.increment_for_testing(100_000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let config = market::create_market_config_for_testing(scenario.ctx());

        market::list_intel(
            &intel_report,
            100_000_000, 5,
            1, // expiry in the past
            vector[0u8],
            &config, &clock, scenario.ctx(),
        );

        intel::destroy_intel_for_testing(intel_report);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ═══════════════════════════════════════════════
    // purchase_intel tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_purchase_intel_success() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // Switch to BUYER
        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());

        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        assert!(market::sold_count(&listing) == 1);
        assert!(market::treasury_value(&config) > 0);

        // cleanup
        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ESelfPurchase)]
    fun test_purchase_self_blocked() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // SELLER tries to buy own listing
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EAlreadyPurchased)]
    fun test_purchase_duplicate_blocked() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5,
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(1_000_000_000, scenario.ctx());

        // First purchase OK
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );
        // Second purchase FAIL
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EInsufficientPayment)]
    fun test_purchase_insufficient_payment() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 5, // price = 0.1 SUI
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(1, scenario.ctx()); // way too little

        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ESoldOut)]
    fun test_purchase_sold_out() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let intel_report = intel::create_intel_for_testing(
            SELLER, 0, 5, 1, 10, 20, 30, 1,
            10_000_000, &clock, scenario.ctx(),
        );
        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id(&intel_report), 0, 1,
            100_000_000, 1, // max 1 buyer
            clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // BUYER buys
        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        // OTHER tries to buy — sold out
        scenario.next_tx(OTHER);
        market::purchase_intel(
            &mut listing, &mut payment, &mut config, &clock, scenario.ctx(),
        );

        coin::burn_for_testing(payment);
        intel::destroy_intel_for_testing(intel_report);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ═══════════════════════════════════════════════
    // delist_intel tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_delist_intel_success() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());

        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::delist_intel(&mut listing, scenario.ctx());
        assert!(!market::is_active(&listing));

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ENotSeller)]
    fun test_delist_not_seller() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(OTHER);
        market::delist_intel(&mut listing, scenario.ctx());

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ═══════════════════════════════════════════════
    // expire_listing tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_expire_listing_success() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        let expiry = clock.timestamp_ms() + 1000;
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, expiry, &clock, scenario.ctx(),
        );

        clock.increment_for_testing(2000); // past expiry
        market::expire_listing(&mut listing, &clock);
        assert!(!market::is_active(&listing));

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingNotExpired)]
    fun test_expire_listing_not_expired() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::expire_listing(&mut listing, &clock); // not expired yet

        market::destroy_listing_for_testing(listing);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    // ═══════════════════════════════════════════════
    // update_price tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_update_price_success() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());
        assert!(market::price(&listing) == 200_000_000);

        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::ENotSeller)]
    fun test_update_price_not_seller() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        scenario.next_tx(OTHER);
        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());

        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EHasBuyers)]
    fun test_update_price_has_buyers() {
        let mut scenario = ts::begin(SELLER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock.increment_for_testing(1000);

        let mut config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        // BUYER purchases first
        scenario.next_tx(BUYER);
        let mut payment = coin::mint_for_testing<sui::sui::SUI>(500_000_000, scenario.ctx());
        market::purchase_intel(&mut listing, &mut payment, &mut config, &clock, scenario.ctx());

        // SELLER tries to change price after purchase
        scenario.next_tx(SELLER);
        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());

        coin::burn_for_testing(payment);
        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = market::EListingNotActive)]
    fun test_update_price_delisted() {
        let mut scenario = ts::begin(SELLER);
        let clock = clock::create_for_testing(scenario.ctx());
        let config = market::create_market_config_for_testing(scenario.ctx());
        let mut listing = market::create_listing_for_testing(
            SELLER, object::id_from_address(@0x1), 0, 1,
            100_000_000, 5, clock.timestamp_ms() + 86400_000,
            &clock, scenario.ctx(),
        );

        market::delist_intel(&mut listing, scenario.ctx());
        market::update_price(&mut listing, 200_000_000, &config, scenario.ctx());

        market::destroy_listing_for_testing(listing);
        market::destroy_market_config_for_testing(config);
        clock::destroy_for_testing(clock);
        scenario.end();
    }
}
