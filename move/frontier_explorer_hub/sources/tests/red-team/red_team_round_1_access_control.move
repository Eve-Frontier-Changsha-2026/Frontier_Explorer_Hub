#[test_only]
module frontier_explorer_hub::red_team_round_1 {
    use sui::test_scenario::{Self as ts};
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;

    use frontier_explorer_hub::intel_market;

    const SELLER: address = @0xA;
    const BUYER: address = @0xB;
    const ATTACKER: address = @0xD;

    // -------------------------------------------------------
    // Round 1: Access Control Bypass
    // -------------------------------------------------------

    // Attack 1a: Non-seller tries to set_encrypted_payload
    #[test]
    #[expected_failure(abort_code = intel_market::ENotSeller)]
    fun red_team_round_1_outsider_seal_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        // Attacker tries to seal someone else's listing
        scenario.next_tx(ATTACKER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::set_encrypted_payload(&mut listing, b"malicious_payload", scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 1b: Non-seller tries to cancel listing
    #[test]
    #[expected_failure(abort_code = intel_market::ENotSeller)]
    fun red_team_round_1_outsider_cancel_listing() {
        let mut scenario = ts::begin(SELLER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let fee = coin::mint_for_testing<SUI>(10_000_000, scenario.ctx());
        intel_market::list_intel(
            b"Test", 1, 0, 0, 0, 0, 5, 100_000_000, 500_000_000,
            fee, &clk, scenario.ctx(),
        );

        scenario.next_tx(ATTACKER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        intel_market::cancel_listing(&mut listing, scenario.ctx());

        ts::return_shared(listing);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 1c: Non-buyer tries to confirm_and_rate
    #[test]
    #[expected_failure(abort_code = intel_market::ENotBuyer)]
    fun red_team_round_1_outsider_confirm_and_rate() {
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

        scenario.next_tx(BUYER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let payment = coin::mint_for_testing<SUI>(500_000_000, scenario.ctx());
        intel_market::purchase_intel(&mut listing, payment, &clk, scenario.ctx());
        ts::return_shared(listing);

        // Attacker tries to confirm (not the buyer)
        scenario.next_tx(ATTACKER);
        let mut listing = scenario.take_shared<intel_market::IntelListing>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::confirm_and_rate(&mut listing, &mut profile, 5, &clk, scenario.ctx());

        ts::return_shared(listing);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 1d: Non-buyer tries to cancel_request
    #[test]
    #[expected_failure(abort_code = intel_market::ENotBuyer)]
    fun red_team_round_1_outsider_cancel_request() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Need intel", 1, 42, b"Description",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Attacker tries to cancel buyer's request
        scenario.next_tx(ATTACKER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::cancel_request(&mut request, scenario.ctx());

        ts::return_shared(request);
        clock::destroy_for_testing(clk);
        scenario.end();
    }

    // Attack 1e: Non-buyer tries to accept_and_rate on bounty
    #[test]
    #[expected_failure(abort_code = intel_market::ENotBuyer)]
    fun red_team_round_1_outsider_accept_bounty() {
        let mut scenario = ts::begin(BUYER);
        let mut clk = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clk, 1000);

        let reward = coin::mint_for_testing<SUI>(2_000_000_000, scenario.ctx());
        intel_market::post_request(
            b"Need intel", 1, 42, b"Description",
            reward, 1000 + 86_400_000, &clk, scenario.ctx(),
        );

        // Seller creates profile and submits
        scenario.next_tx(SELLER);
        intel_market::create_seller_profile(&clk, scenario.ctx());
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        intel_market::fulfill_request(&mut request, b"enc_data", &clk, scenario.ctx());
        ts::return_shared(request);

        // Attacker (not buyer) tries to accept
        scenario.next_tx(ATTACKER);
        let mut request = scenario.take_shared<intel_market::IntelRequest>();
        let mut profile = scenario.take_shared<intel_market::SellerProfile>();
        intel_market::accept_and_rate(&mut request, &mut profile, SELLER, 5, &clk, scenario.ctx());

        ts::return_shared(request);
        ts::return_shared(profile);
        clock::destroy_for_testing(clk);
        scenario.end();
    }
}
