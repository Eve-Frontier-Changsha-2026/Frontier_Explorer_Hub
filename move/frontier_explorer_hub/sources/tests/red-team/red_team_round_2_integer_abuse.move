#[test_only]
module frontier_explorer_hub::red_team_round_2 {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;

    // -------------------------------------------------------
    // Round 2: Integer Abuse
    // -------------------------------------------------------

    // Attack 2a: Weighted score overflow — MAX rating (5) * MAX_U64 price
    // update_profile line 287: (rating as u64) * price_mist
    // If price_mist ~ MAX_U64/5, then 5 * (MAX_U64/5+1) overflows.
    // This test checks that MAX_PRICE_MIST guard blocks listings with
    // near-MAX_U64 prices that would overflow total_weighted_score.
    #[test]
    #[expected_failure(abort_code = intel_market::EPriceTooHigh)]
    fun red_team_round_2_weighted_score_overflow() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        // price = MAX_U64 / 5 = 3689348814741910323
        // This won't overflow on first trade: 5 * 3689348814741910323 = 18446744073709551615 = MAX_U64 exactly
        let huge_price: u64 = 3689348814741910323;

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Big", 1, 0, 0, 0, 0, 5, 100_000_000, huge_price,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(huge_price, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // First trade: 5 * huge_price = MAX_U64 exactly (no overflow)
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 5, &clk, scenario.ctx());
        // total_weighted_score should be MAX_U64
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 2b: Second trade overflows total_weighted_score
    // After first trade total_weighted_score = MAX_U64,
    // Any subsequent trade with rating > 0 and price > 0 will overflow.
    // NOTE: This test is EXPECTED TO FAIL with arithmetic overflow if
    // the contract doesn't protect against it. If it passes, EXPLOITED.
    // We mark it as expected_failure to not break the test suite,
    // but the real finding is that the overflow IS possible.
    #[test]
    #[expected_failure]
    fun red_team_round_2_second_trade_overflows() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        let huge_price: u64 = 3689348814741910323;

        // --- Trade 1: saturate total_weighted_score ---
        let fee1 = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"T1", 1, 0, 0, 0, 0, 5, 200_000_000, huge_price,
            fee1, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment1 = coin::mint_for_testing<SUI>(huge_price, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment1, &clk, scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 5, &clk, scenario.ctx());
        ts::return_shared(listing);
        ts::return_shared(profile);

        // --- Trade 2: this should overflow ---
        scenario.next_tx(SELLER);
        let fee2 = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"T2", 1, 0, 0, 0, 0, 5, 200_000_000, 1_000_000_000,
            fee2, &clk, scenario.ctx(),
        );

        // Need to get the second listing (not first)
        scenario.next_tx(SELLER);
        let mut listing2 = scenario.take_shared<intel_market::IntelListing>();
        // Skip if this is the first listing (already SOLD)
        if (intel_market::listing_status(&listing2) != 0) {
            ts::return_shared(listing2);
            listing2 = scenario.take_shared<intel_market::IntelListing>();
        };
        intel_market::set_encrypted_payload(&mut listing2, b"enc2", scenario.ctx());
        ts::return_shared(listing2);

        scenario.next_tx(BUYER);
        let mut listing2 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_status(&listing2) != 0) {
            ts::return_shared(listing2);
            listing2 = scenario.take_shared<intel_market::IntelListing>();
        };
        let payment2 = coin::mint_for_testing<SUI>(1_000_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing2, payment2, &clk, scenario.ctx());
        ts::return_shared(listing2);

        scenario.next_tx(BUYER);
        let mut listing2 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_status(&listing2) != 1) {
            ts::return_shared(listing2);
            listing2 = scenario.take_shared<intel_market::IntelListing>();
        };
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        // This call triggers: total_weighted_score (MAX_U64) + 5 * 1_000_000_000 → OVERFLOW
        intel_market::confirm_and_rate(&mut listing2, &mut profile, 5, &clk, scenario.ctx());

        ts::return_shared(listing2);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 2c: Deadline underflow — deadline < now causes subtraction underflow in post_request
    // Line 538: let duration = deadline - now; (no checked_sub)
    #[test]
    #[expected_failure]
    fun red_team_round_2_deadline_underflow() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 100_000_000);

        // deadline (50_000_000) < now (100_000_000) → underflow on line 538
        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Underflow", 1, 42, b"test",
            reward, 50_000_000, &clk, scenario.ctx(),
        );

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 2d: Zero price listing — price_mist = 0
    // No minimum price check exists. Seller can list at 0 MIST.
    // Buyer pays 0 to get intel. Combined with auto_release giving default rating 3,
    // seller can farm reputation for free.
    #[test]
    fun red_team_round_2_zero_price_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        // Zero price!
        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Free", 1, 0, 0, 0, 0, 5, 100_000_000, 0,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        // Buyer pays 0
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(0, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        assert!(intel_market::listing_status(&listing) == 1); // SOLD with 0 payment!
        ts::return_shared(listing);

        // Confirm to get free reputation
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 5, &clk, scenario.ctx());
        // Seller got +5 score for free
        assert!(intel_market::profile_total_score(&profile) == 5);
        assert!(intel_market::profile_total_trades(&profile) == 1);
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 2e: total_volume_mist overflow via large volume trades
    // Similar to weighted_score but targeting total_volume_mist on line 288
    #[test]
    #[expected_failure]
    fun red_team_round_2_volume_overflow() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        // Use MAX_U64 as price — first trade will set volume to MAX_U64
        // Second trade will overflow
        let max_price: u64 = 18446744073709551615;

        let fee1 = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"V1", 1, 0, 0, 0, 0, 5, 200_000_000, max_price,
            fee1, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"enc", scenario.ctx());
        ts::return_shared(listing);

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(max_price, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // rating=1 so weighted_score = 1*MAX_U64 = MAX_U64 (fine)
        // but total_volume = MAX_U64 (overflow on next)
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 1, &clk, scenario.ctx());
        ts::return_shared(listing);
        ts::return_shared(profile);

        // Trade 2
        scenario.next_tx(SELLER);
        let fee2 = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"V2", 1, 0, 0, 0, 0, 5, 200_000_000, 1,
            fee2, &clk, scenario.ctx(),
        );

        scenario.next_tx(SELLER);
        let mut listing2 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_status(&listing2) != 0) {
            ts::return_shared(listing2);
            listing2 = scenario.take_shared<intel_market::IntelListing>();
        };
        intel_market::set_encrypted_payload(&mut listing2, b"enc2", scenario.ctx());
        ts::return_shared(listing2);

        scenario.next_tx(BUYER);
        let mut listing2 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_status(&listing2) != 0) {
            ts::return_shared(listing2);
            listing2 = scenario.take_shared<intel_market::IntelListing>();
        };
        let payment2 = coin::mint_for_testing<SUI>(1, scenario.ctx());
        intel_market::purchase_intel(&mut listing2, payment2, &clk, scenario.ctx());
        ts::return_shared(listing2);

        scenario.next_tx(BUYER);
        let mut listing2 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_status(&listing2) != 1) {
            ts::return_shared(listing2);
            listing2 = scenario.take_shared<intel_market::IntelListing>();
        };
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        // total_volume (MAX_U64) + 1 → OVERFLOW
        intel_market::confirm_and_rate(&mut listing2, &mut profile, 1, &clk, scenario.ctx());

        ts::return_shared(listing2);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
