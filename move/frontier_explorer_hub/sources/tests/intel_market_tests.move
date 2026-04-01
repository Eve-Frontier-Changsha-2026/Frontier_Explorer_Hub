#[test_only]
module frontier_explorer_hub::intel_market_tests {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const OUTSIDER: address = @0xC;

    // ═══════════════════════════════════════════════
    // Sell Mode Tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_list_and_seal() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // List intel
        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        let _listing_id = intel_market::list_intel(
            b"Threat near Region 42",
            42, 10, 20, 30,
            1,               // THREAT
            8,               // severity
            100_000_000,     // expiry
            500_000_000,     // price 0.5 SUI
            fee,
            &clk,
            scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        assert!(!intel_market::listing_is_sealed(&listing));

        // Seal
        intel_market::set_encrypted_payload(&mut listing, b"secret_data_encrypted", scenario.ctx());
        assert!(intel_market::listing_is_sealed(&listing));

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_purchase_confirm_rate() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Create profile
        intel_market::create_seller_profile(&clk, scenario.ctx());

        // List + seal
        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"encrypted", scenario.ctx());
        ts::return_shared(listing);

        // Buyer purchases
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        assert!(intel_market::listing_status(&listing) == 1); // SOLD
        ts::return_shared(listing);

        // Buyer confirms + rates
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 4, &clk, scenario.ctx());
        assert!(intel_market::profile_total_trades(&profile) == 1);
        assert!(intel_market::profile_total_score(&profile) == 4);
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_auto_release() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 200_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Advance 25h
        clock::set_for_testing(&mut clk, 1000 + 90_000_000);

        // Outsider triggers auto-release
        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_release(&mut listing, &mut profile, &clk, scenario.ctx());
        assert!(intel_market::profile_total_trades(&profile) == 1);
        assert!(intel_market::profile_total_score(&profile) == 3); // default
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_cancel_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::cancel_listing(&mut listing, scenario.ctx());
        assert!(intel_market::listing_status(&listing) == 3); // CANCELLED
        ts::return_shared(listing);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_expire_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        // Advance past expiry
        clock::set_for_testing(&mut clk, 100_000_001);

        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::expire_listing(&mut listing, &clk);
        assert!(intel_market::listing_status(&listing) == 2); // EXPIRED
        ts::return_shared(listing);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::ESelfPurchase)]
    fun test_self_purchase_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());

        // Seller tries to buy own listing — should fail
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInsufficientPayment)]
    fun test_insufficient_payment_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx()); // Only 0.1, need 0.5
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::ENotSealed)]
    fun test_purchase_unsealed_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        // Try to buy without sealing
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EAutoReleaseNotReady)]
    fun test_auto_release_too_early_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 200_000_000, 100_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Only advance 1h — not enough
        clock::set_for_testing(&mut clk, 1000 + 3_600_000);

        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_release(&mut listing, &mut profile, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // ═══════════════════════════════════════════════
    // Bounty Mode Tests
    // ═══════════════════════════════════════════════

    #[test]
    fun test_post_fulfill_accept() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Post request
        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Need threat intel Region 42",
            1, 42, b"Looking for hostile fleet positions",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Seller creates profile + fulfills
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"encrypted_intel", &clk, scenario.ctx());
        assert!(intel_market::request_status(&request) == 1); // REVIEWING
        assert!(intel_market::request_submission_count(&request) == 1);
        ts::return_shared(request);

        // Buyer accepts
        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::accept_and_rate(&mut request, &mut profile, SELLER, 5, &clk, scenario.ctx());
        assert!(intel_market::request_status(&request) == 2); // COMPLETED
        assert!(intel_market::profile_total_score(&profile) == 5);
        ts::return_shared(request);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_cancel_request_no_subs() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 86_400_000,
            &clk, scenario.ctx(),
        );

        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::cancel_request(&mut request, scenario.ctx());
        assert!(intel_market::request_status(&request) == 3); // CANCELLED
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EHasSubmissions)]
    fun test_cancel_request_with_subs_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 86_400_000,
            &clk, scenario.ctx(),
        );

        // Seller fulfills
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Buyer tries to cancel — should fail
        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::cancel_request(&mut request, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_auto_settle_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 200_000_000,
            &clk, scenario.ctx(),
        );

        // Seller fulfills
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Advance 25h
        clock::set_for_testing(&mut clk, 1000 + 90_000_000);

        // Outsider triggers auto-settle
        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_settle_request(
            &mut request, &mut profile, SELLER, &clk, scenario.ctx(),
        );
        assert!(intel_market::request_status(&request) == 2); // COMPLETED
        ts::return_shared(request);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_expire_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 86_400_000,
            &clk, scenario.ctx(),
        );

        // Advance past deadline
        clock::set_for_testing(&mut clk, 1000 + 86_400_001);

        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::expire_request(&mut request, &clk, scenario.ctx());
        assert!(intel_market::request_status(&request) == 4); // EXPIRED
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EAlreadySubmitted)]
    fun test_duplicate_submission_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 86_400_000,
            &clk, scenario.ctx(),
        );

        // Seller fulfills once
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc1", &clk, scenario.ctx());
        ts::return_shared(request);

        // Same seller tries again — should fail
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc2", &clk, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EAutoSettleNotReady)]
    fun test_auto_settle_too_early_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Test", 0, 1, b"desc", reward, 1000 + 200_000_000,
            &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Only 1h — not enough for 24h timeout
        clock::set_for_testing(&mut clk, 1000 + 3_600_000);

        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::auto_settle_request(
            &mut request, &mut profile, SELLER, &clk, scenario.ctx(),
        );

        ts::return_shared(request);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // ═══════════════════════════════════════════════
    // Monkey / Edge Case Tests
    // ═══════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = intel_market::ETitleTooLong)]
    fun test_title_257_chars_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let mut title = vector[];
        let mut i = 0u64;
        while (i < 257) { title.push_back(0x41); i = i + 1; };

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(title, 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_title_256_chars_succeeds() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let mut title = vector[];
        let mut i = 0u64;
        while (i < 256) { title.push_back(0x41); i = i + 1; };

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(title, 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInvalidRating)]
    fun test_rating_zero_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let pay = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, pay, &clk, scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 0, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInvalidRating)]
    fun test_rating_six_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let pay = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, pay, &clk, scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 6, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EPayloadEmpty)]
    fun test_empty_payload_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, vector[], scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInvalidIntelType)]
    fun test_invalid_intel_type_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 99, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInvalidSeverity)]
    fun test_severity_11_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 11, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EExpiryInPast)]
    fun test_expiry_in_past_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 100_000_000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 50_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EInsufficientFee)]
    fun test_insufficient_fee_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(9_999_999, scenario.ctx()); // 1 MIST short
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::ENotSeller)]
    fun test_non_seller_cancel_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        // Outsider tries to cancel
        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::cancel_listing(&mut listing, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EAlreadySealed)]
    fun test_double_seal_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc1", scenario.ctx());
        // Try seal again
        intel_market::set_encrypted_payload(&mut listing, b"enc2", scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::ENotBuyer)]
    fun test_outsider_confirm_fails() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(b"T", 1, 0, 0, 0, 0, 5, 100_000_000, 100_000_000, fee, &clk, scenario.ctx());

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let pay = coin::mint_for_testing<SUI>(100_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, pay, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Outsider tries to confirm
        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 3, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EDeadlineInvalid)]
    fun test_deadline_too_short_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        // Deadline only 30min from now (min is 1h)
        intel_market::post_request(b"T", 0, 1, b"d", reward, 1000 + 1_800_000, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = intel_market::EDeadlineInvalid)]
    fun test_deadline_too_long_fails() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        // Deadline 8 days from now (max is 7d)
        intel_market::post_request(b"T", 0, 1, b"d", reward, 1000 + 691_200_000, &clk, scenario.ctx());

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    #[test]
    fun test_multiple_sellers_fulfill_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(b"Multi", 1, 42, b"desc", reward, 1000 + 86_400_000, &clk, scenario.ctx());

        // Seller A fulfills
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc_a", &clk, scenario.ctx());
        assert!(intel_market::request_submission_count(&request) == 1);
        ts::return_shared(request);

        // Outsider (Seller B) also fulfills
        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc_b", &clk, scenario.ctx());
        assert!(intel_market::request_submission_count(&request) == 2);
        assert!(intel_market::request_status(&request) == 1); // Still REVIEWING
        ts::return_shared(request);

        // Buyer picks seller A
        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::accept_and_rate(&mut request, &mut profile, SELLER, 5, &clk, scenario.ctx());
        assert!(intel_market::request_status(&request) == 2); // COMPLETED
        ts::return_shared(request);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
