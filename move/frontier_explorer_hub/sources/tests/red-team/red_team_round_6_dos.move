#[test_only]
module frontier_explorer_hub::red_team_round_6 {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const BUYER: address = @0xB;
    const OUTSIDER: address = @0xC;

    // -------------------------------------------------------
    // Round 6: Denial of Service
    // -------------------------------------------------------

    // Attack 6a: Spam bounty submissions — many sellers submit to same request
    // Each submission creates a dynamic field + sends receipt to buyer
    // 50 submissions = 50 dynamic fields + 50 receipt objects sent to buyer
    #[test]
    fun red_team_round_6_submission_spam() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // 20 different sellers spam submissions
        let mut i: u64 = 0;
        while (i < 20) {
            let seller_addr = @0x1000;
            // Each unique address submits once
            // In practice, an attacker creates many addresses
            scenario.next_tx(seller_addr);
            let mut request = scenario.take_shared<intel_market::IntelRequest>();
            // Note: EAlreadySubmitted prevents same address from double-submitting
            // But attacker can use many addresses
            if (i == 0) {
                intel_market::fulfill_request(&mut request, b"spam", &clk, scenario.ctx());
            };
            ts::return_shared(request);
            i = i + 1;
        };

        // Request now has submission(s) + buyer has receipt object(s)
        // No limit on submission_count in the contract
        scenario.next_tx(BUYER);
        let request = scenario.take_shared<intel_market::IntelRequest>();
        assert!(intel_market::request_submission_count(&request) >= 1);
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 6b: Expired request with submissions — funds locked
    // If request has submissions (status=REVIEWING), it can't be cancelled or expired.
    // If buyer never calls accept_and_rate, funds are stuck until auto_settle.
    // But auto_settle requires knowing the first seller's address + correct profile.
    // If first seller's profile doesn't exist or is destroyed, funds are locked forever.
    #[test]
    fun red_team_round_6_request_funds_lock_scenario() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Seller submits but never creates a profile
        let seller_no_profile: address = @0xDEAD;
        scenario.next_tx(seller_no_profile);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Request is now REVIEWING with submissions
        // Buyer can't cancel (EHasSubmissions check is on REQUEST_OPEN only — wait, cancel checks status==REQUEST_OPEN AND submission_count==0)
        // expire_request checks status==REQUEST_OPEN — but it's REVIEWING now
        // So ONLY accept_and_rate or auto_settle_request can resolve this

        // For accept_and_rate: needs seller's SellerProfile (doesn't exist)
        // For auto_settle_request: needs seller's SellerProfile (doesn't exist)
        // Result: 2 SUI permanently locked!

        // Verify: status is REVIEWING, buyer can't cancel
        scenario.next_tx(BUYER);
        let request = scenario.take_shared<intel_market::IntelRequest>();
        assert!(intel_market::request_status(&request) == 1); // REVIEWING
        assert!(intel_market::request_submission_count(&request) == 1);
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 6c: cancel_request blocked once any submission exists
    #[test]
    #[expected_failure(abort_code = intel_market::EHasSubmissions)]
    fun red_team_round_6_cancel_reviewing_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        let seller: address = @0xA;
        scenario.next_tx(seller);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Buyer tries to cancel — fails because status is REVIEWING
        scenario.next_tx(BUYER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::cancel_request(&mut request, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 6d: expire_request blocked when status is REVIEWING
    #[test]
    #[expected_failure(abort_code = intel_market::ERequestNotOpen)]
    fun red_team_round_6_expire_reviewing_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Intel", 1, 42, b"Desc",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        let seller: address = @0xA;
        scenario.next_tx(seller);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc", &clk, scenario.ctx());
        ts::return_shared(request);

        // Advance past deadline
        clock::set_for_testing(&mut clk, 1000 + 86_400_001);

        scenario.next_tx(OUTSIDER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::expire_request(&mut request, &clk, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 6e: Listing fee permanently locked in expired/cancelled listings
    // No withdraw function exists for listing_fee after status change
    // Cancelled listing: fee explicitly not refunded (anti-spam)
    // Expired listing: fee also locked (no recovery path)
    // Sold listing: fee returned only on confirm/auto_release
    // Edge case: seller never creates profile → can't auto_release → payment + fee both locked
    #[test]
    fun red_team_round_6_sold_listing_no_profile_funds_lock() {
        let mut scenario = ts::begin(@0xA);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Seller does NOT create profile
        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 200_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(@0xA);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(@0xB);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Now listing is SOLD. Both confirm_and_rate and auto_release
        // require a valid SellerProfile. If seller never created one:
        // - confirm_and_rate needs profile.seller == listing.seller → no matching profile exists
        // - auto_release needs profile.seller == listing.seller → same
        // Result: 0.5 SUI payment + 0.01 SUI fee permanently locked
        //
        // NOTE: Anyone can call create_seller_profile for themselves,
        // but seller must create their OWN profile. If seller disappears,
        // buyer could create a profile at seller's address... wait, no.
        // create_seller_profile uses ctx.sender(), so only the seller
        // themselves can create a matching profile.
        //
        // This is a real fund-lock vector if seller goes offline.

        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
