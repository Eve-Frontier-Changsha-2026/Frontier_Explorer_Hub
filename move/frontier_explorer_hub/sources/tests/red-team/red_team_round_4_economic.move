#[test_only]
module frontier_explorer_hub::red_team_round_4 {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const SYBIL1: address = @0xF1;

    // -------------------------------------------------------
    // Round 4: Economic Exploits
    // -------------------------------------------------------

    // Attack 4a: Reputation farming via self-trade with zero price
    // Seller lists at price=0, sybil buyer purchases for free,
    // confirms with rating=5. Repeat to inflate reputation.
    // No minimum price check → seller can farm rep cheaply (only listing_fee cost).
    #[test]
    fun red_team_round_4_reputation_farming_zero_price() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        intel_market::create_seller_profile(&clk, scenario.ctx());

        // 3 rounds of free reputation farming
        let mut i = 0;
        while (i < 3) {
            let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
            intel_market::list_intel(
                b"Free", 1, 0, 0, 0, 0, 5, 100_000_000, 0,
                fee, &clk, scenario.ctx(),
            );
            i = i + 1;
        };

        // Seal all 3
        scenario.next_tx(SELLER);
        let mut l1 = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut l1, b"a", scenario.ctx());
        ts::return_shared(l1);

        scenario.next_tx(SELLER);
        let mut l2 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_is_sealed(&l2)) {
            ts::return_shared(l2);
            l2 = scenario.take_shared<intel_market::IntelListing>();
        };
        intel_market::set_encrypted_payload(&mut l2, b"b", scenario.ctx());
        ts::return_shared(l2);

        scenario.next_tx(SELLER);
        let mut l3 = scenario.take_shared<intel_market::IntelListing>();
        if (intel_market::listing_is_sealed(&l3)) {
            ts::return_shared(l3);
            l3 = scenario.take_shared<intel_market::IntelListing>();
            if (intel_market::listing_is_sealed(&l3)) {
                ts::return_shared(l3);
                l3 = scenario.take_shared<intel_market::IntelListing>();
            };
        };
        intel_market::set_encrypted_payload(&mut l3, b"c", scenario.ctx());
        ts::return_shared(l3);

        // Sybil buys first one for free
        scenario.next_tx(SYBIL1);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(0, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Sybil confirms with max rating
        scenario.next_tx(SYBIL1);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 5, &clk, scenario.ctx());
        // Profile boosted: 1 trade, score 5, volume 0, weighted 0
        assert!(intel_market::profile_total_trades(&profile) == 1);
        assert!(intel_market::profile_total_score(&profile) == 5);
        // weighted_score = 5 * 0 = 0 (volume weighting mitigates this somewhat)
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 4b: Overpayment not refunded
    // Buyer pays 10 SUI for a 0.5 SUI listing → excess stays in escrow
    // Only price_mist worth is "expected" but entire payment balance is transferred to seller
    #[test]
    fun red_team_round_4_overpayment_kept() {
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

        // Overpay: 10 SUI instead of 0.5 SUI
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(10_000_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Confirm — entire payment balance goes to seller
        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 4, &clk, scenario.ctx());
        // Seller received 10 SUI (not 0.5 SUI) — overpayment not refunded
        // price in profile is the full payment balance, not listed price
        ts::return_shared(listing);
        ts::return_shared(profile);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 4c: Dust listing spam — create many 1-MIST listings to pollute marketplace
    // Only costs MIN_LISTING_FEE per listing (0.01 SUI)
    #[test]
    fun red_team_round_4_dust_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Create 5 dust listings (1 MIST each)
        let mut i = 0;
        while (i < 5) {
            let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
            intel_market::list_intel(
                b"Dust", 1, 0, 0, 0, 0, 1, 100_000_000, 1,
                fee, &clk, scenario.ctx(),
            );
            i = i + 1;
        };
        // All 5 created as shared objects — polluting global object space
        // Cost: 5 * 0.01 SUI = 0.05 SUI total (cheap spam)

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 4d: Bounty reward with 0 value
    // No minimum reward check — buyer can post request with 0 reward
    #[test]
    fun red_team_round_4_zero_reward_bounty() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        // Zero reward bounty
        let reward = coin::mint_for_testing<SUI>(0, scenario.ctx());
        intel_market::post_request(
            b"Free work plz", 1, 42, b"Need intel for free",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Request created with 0 reward — sellers waste effort
        scenario.next_tx(BUYER);
        let request = scenario.take_shared<intel_market::IntelRequest>();
        assert!(intel_market::request_reward_value(&request) == 0);
        ts::return_shared(request);

        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 4e: Listing fee never refunded on cancel
    // When seller cancels, listing_fee is NOT returned (line 484 comment confirms this)
    // This is by-design spam prevention, but combined with expired listings,
    // the listing_fee is also permanently locked (no withdrawal mechanism)
    #[test]
    fun red_team_round_4_locked_listing_fee_on_expire() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        // Expire the listing
        clock::set_for_testing(&mut clk, 100_000_001);
        scenario.next_tx(SELLER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::expire_listing(&mut listing, &clk, scenario.ctx());
        // listing_fee (0.01 SUI) is permanently locked in the shared object
        // No function to withdraw it after expiry or cancellation
        ts::return_shared(listing);

        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
