#[test_only]
module frontier_explorer_hub::red_team_round_5 {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const SELLER2: address = @0xF2;
    const BUYER: address = @0xB;
    const OUTSIDER: address = @0xC;

    // -------------------------------------------------------
    // Round 5: Ordering / Timing Attacks
    // -------------------------------------------------------

    // Attack 5a: Auto-release at exact boundary (purchased_at + AUTO_RELEASE_MS)
    // Line 450: clock.timestamp_ms() > purchased_at + AUTO_RELEASE_MS
    // Uses strict >, so exactly at boundary should fail
    #[test]
    #[expected_failure(abort_code = intel_market::EAutoReleaseNotReady)]
    fun red_team_round_5_auto_release_exact_boundary() {
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

        // Set clock to exactly purchased_at + AUTO_RELEASE_MS = 1000 + 86400000
        clock::set_for_testing(&mut clk, 1000 + 86_400_000);

        scenario.next_tx(OUTSIDER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        // Should fail: needs STRICTLY greater than
        intel_market::auto_release(&mut listing, &mut profile, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 5b: Auto-settle at exact boundary for bounty
    #[test]
    #[expected_failure(abort_code = intel_market::EAutoSettleNotReady)]
    fun red_team_round_5_auto_settle_exact_boundary() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Description",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        // Fulfill at time 1000
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Set clock to exactly first_submission_at + REVIEW_TIMEOUT_MS
        clock::set_for_testing(&mut clk, 1000 + 86_400_000);

        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        // Should fail: needs STRICTLY greater than
        intel_market::auto_settle_request(&mut request, &mut profile, &clk, scenario.ctx());

        ts::return_shared(request);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 5c: Submit to bounty after deadline (first submission)
    #[test]
    #[expected_failure(abort_code = intel_market::ERequestDeadlinePassed)]
    fun red_team_round_5_submit_after_deadline() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Advance past deadline
        clock::set_for_testing(&mut clk, 1000 + 86_400_001);

        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 5d: Submit AFTER deadline but AFTER first submission (deadline bypass)
    // Line 586-588: deadline check only runs if submission_count == 0
    // Second+ submissions are NOT deadline-checked!
    // This means sellers can submit after deadline if someone else submitted before.
    #[test]
    fun red_team_round_5_late_submission_after_first() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // First seller submits before deadline
        scenario.next_tx(SELLER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc1", &clk, scenario.ctx());
        ts::return_shared(request);

        // Advance PAST deadline
        clock::set_for_testing(&mut clk, 1000 + 86_400_001);

        // Second seller submits AFTER deadline — should this be allowed?
        // The contract allows it because deadline check is skipped for count > 0
        scenario.next_tx(SELLER2);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"late_submission", &clk, scenario.ctx());
        // If this passes: VULNERABILITY — late submissions accepted
        assert!(intel_market::request_submission_count(&request) == 2);
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 5e: Auto-settle with wrong first_seller
    // Attacker claims to be first submitter but actually submitted second
    #[test]
    #[expected_failure(abort_code = intel_market::ENotSeller)]
    fun red_team_round_5_auto_settle_wrong_first_seller() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // SELLER submits first at time 1000
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc1", &clk, scenario.ctx());
        ts::return_shared(request);

        // SELLER2 submits second at time 2000
        clock::set_for_testing(&mut clk, 2000);
        scenario.next_tx(SELLER2);
        intel_market::create_seller_profile(&clk, scenario.ctx());
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc2", &clk, scenario.ctx());
        ts::return_shared(request);

        // Wait for auto-settle
        clock::set_for_testing(&mut clk, 1000 + 86_400_001);

        // Try auto-settle with SELLER2 (not the first submitter)
        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        if (intel_market::profile_seller(&profile) != SELLER2) {
            ts::return_shared(profile);
            profile = scenario.take_shared<intel_market::SellerProfile>();
        };
        // SELLER2's profile.seller != stored first_seller (SELLER), so ENotSeller
        intel_market::auto_settle_request(&mut request, &mut profile, &clk, scenario.ctx());

        ts::return_shared(request);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
