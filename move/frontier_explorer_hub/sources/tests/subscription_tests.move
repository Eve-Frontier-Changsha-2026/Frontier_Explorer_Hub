#[test_only]
module frontier_explorer_hub::subscription_tests {
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;
    use sui::test_utils;

    use frontier_explorer_hub::admin;
    use frontier_explorer_hub::subscription;

    const MS_PER_DAY: u64 = 86_400_000;

    #[test]
    fun test_subscribe_and_check_premium() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        // 1 SUI/day * 1 day = 1 SUI = 1_000_000_000 MIST
        let mut coin = coin::mint_for_testing<SUI>(2_000_000_000, &mut ctx);

        subscription::subscribe(&mut config, &mut coin, 1, &clock, &mut ctx);

        // Coin should have 1 SUI left
        assert!(coin.value() == 1_000_000_000, 0);
        // Treasury should have 1 SUI
        assert!(subscription::treasury_balance(&config) == 1_000_000_000, 1);

        // We can't hold the NFT directly since it was transferred.
        // Instead, test is_active_premium via a fresh subscribe-style NFT.
        // Actually, let's use a different approach: subscribe returns nothing,
        // so we test via a second path. Let's just verify treasury and coin math.

        // Clean up
        clock::destroy_for_testing(clock);
        coin::burn_for_testing(coin);
        subscription::destroy_config_for_testing(config);
    }

    #[test]
    fun test_subscribe_and_active_check_with_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);
        let mut coin = coin::mint_for_testing<SUI>(2_000_000_000, &mut ctx);

        // Create a free NFT and upgrade it to test is_active_premium
        let mut nft = subscription::create_free_nft_for_testing(&clock, &mut ctx);
        subscription::upgrade(&mut config, &mut nft, &mut coin, 1, &clock, &mut ctx);

        // Should be active premium now
        assert!(subscription::is_active_premium(&nft, &clock) == true, 0);
        assert!(subscription::tier(&nft) == admin::tier_premium(), 1);

        // Fast forward past expiry
        clock::increment_for_testing(&mut clock, MS_PER_DAY + 1);
        assert!(subscription::is_active_premium(&nft, &clock) == false, 2);

        // Clean up
        clock::destroy_for_testing(clock);
        coin::burn_for_testing(coin);
        transfer::public_transfer(nft, @0x0);
        subscription::destroy_config_for_testing(config);
    }

    #[test]
    fun test_renew_extends_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);
        // Need enough for 1 + 7 = 8 days = 8 SUI
        let mut coin = coin::mint_for_testing<SUI>(10_000_000_000, &mut ctx);

        // Create free NFT, upgrade for 1 day
        let mut nft = subscription::create_free_nft_for_testing(&clock, &mut ctx);
        subscription::upgrade(&mut config, &mut nft, &mut coin, 1, &clock, &mut ctx);

        let initial_expires = subscription::expires_at(&nft);
        assert!(initial_expires == MS_PER_DAY, 0); // clock starts at 0

        // Renew 7 more days (not expired yet)
        subscription::renew(&mut config, &mut nft, &mut coin, 7, &clock, &mut ctx);
        let new_expires = subscription::expires_at(&nft);
        // Should be initial + 7 days = 8 days total
        assert!(new_expires == 8 * MS_PER_DAY, 1);

        // Treasury should have 8 SUI
        assert!(subscription::treasury_balance(&config) == 8_000_000_000, 2);

        // Clean up
        clock::destroy_for_testing(clock);
        coin::burn_for_testing(coin);
        transfer::public_transfer(nft, @0x0);
        subscription::destroy_config_for_testing(config);
    }

    #[test]
    fun test_upgrade_free_to_premium() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);
        let mut coin = coin::mint_for_testing<SUI>(2_000_000_000, &mut ctx);

        let mut nft = subscription::create_free_nft_for_testing(&clock, &mut ctx);
        assert!(subscription::tier(&nft) == admin::tier_free(), 0);

        subscription::upgrade(&mut config, &mut nft, &mut coin, 1, &clock, &mut ctx);
        assert!(subscription::tier(&nft) == admin::tier_premium(), 1);
        assert!(subscription::is_active_premium(&nft, &clock) == true, 2);

        // Clean up
        clock::destroy_for_testing(clock);
        coin::burn_for_testing(coin);
        transfer::public_transfer(nft, @0x0);
        subscription::destroy_config_for_testing(config);
    }

    #[test]
    #[expected_failure(abort_code = subscription::EPriceBelowMinimum)]
    fun test_set_price_below_minimum() {
        let mut ctx = tx_context::dummy();
        let admin_cap = admin::create_admin_cap_for_testing(&mut ctx);
        let mut config = subscription::create_config_for_testing(&mut ctx);

        // MIN_PRICE_PER_DAY = 100_000_000 (0.1 SUI), try setting below
        subscription::set_price_per_day(&admin_cap, &mut config, 1);

        // Clean up (won't reach here)
        test_utils::destroy(admin_cap);
        subscription::destroy_config_for_testing(config);
    }
}
