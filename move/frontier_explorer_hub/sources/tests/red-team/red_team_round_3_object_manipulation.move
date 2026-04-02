#[test_only]
module frontier_explorer_hub::red_team_round_3 {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const BUYER2: address = @0xE;

    // -------------------------------------------------------
    // Round 3: Object Manipulation
    // -------------------------------------------------------

    // Attack 3a: Purchase expired listing
    // After expire_listing sets status=EXPIRED, try to purchase
    #[test]
    #[expected_failure(abort_code = intel_market::EListingNotActive)]
    fun red_team_round_3_purchase_expired_listing() {
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

        // Expire it
        clock::set_for_testing(&mut clk, 100_000_001);
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::expire_listing(&mut listing, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Try purchase after expiry
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 3b: Purchase cancelled listing
    #[test]
    #[expected_failure(abort_code = intel_market::EListingNotActive)]
    fun red_team_round_3_purchase_cancelled_listing() {
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
        intel_market::cancel_listing(&mut listing, scenario.ctx());
        ts::return_shared(listing);

        // Try purchase cancelled (not sealed, so will fail ENotSealed first,
        // but status check comes before seal check)
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 3c: Double purchase — second buyer tries to buy already-sold listing
    #[test]
    #[expected_failure(abort_code = intel_market::EListingNotActive)]
    fun red_team_round_3_double_purchase() {
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

        // Buyer 1 purchases
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Buyer 2 tries to purchase — status is SOLD, not ACTIVE
        scenario.next_tx(BUYER2);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment2 = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment2, &clk, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 3d: Wrong profile in confirm_and_rate
    // Pass a different seller's profile when confirming
    #[test]
    #[expected_failure(abort_code = intel_market::ENotSeller)]
    fun red_team_round_3_wrong_profile_confirm() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        // Create a different profile (attacker's)
        scenario.next_tx(BUYER2);
        intel_market::create_seller_profile(&clk, scenario.ctx());

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Confirm with wrong profile
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        // This will get the first shared profile, which may be BUYER2's
        // The test verifies that profile.seller must match listing.seller
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        if (intel_market::profile_seller(&profile) == SELLER) {
            // Skip to get the wrong one
            ts::return_shared(profile);
            profile = scenario.take_shared<intel_market::SellerProfile>();
        };
        intel_market::confirm_and_rate(&mut listing, &mut profile, 4, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 3e: Cancel listing after it has been purchased (should fail)
    #[test]
    #[expected_failure(abort_code = intel_market::EListingNotActive)]
    fun red_team_round_3_cancel_sold_listing() {
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
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Seller tries to cancel after sale
        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::cancel_listing(&mut listing, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
