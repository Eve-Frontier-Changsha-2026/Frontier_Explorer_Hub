import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import {
  buildListIntel,
  buildPurchaseIntel,
  buildDelistIntel,
  buildExpireListing,
  buildUpdatePrice,
} from "@/lib/ptb/market";

const FAKE_INTEL = "0x1111111111111111111111111111111111111111111111111111111111111111";
const FAKE_LISTING = "0x2222222222222222222222222222222222222222222222222222222222222222";
const CLOCK_ID = "0x6";

describe("market PTB builders", () => {
  it("buildListIntel adds moveCall", () => {
    const tx = new Transaction();
    buildListIntel(tx, FAKE_INTEL, 100_000_000, 5, Date.now() + 86400000, new Uint8Array([1, 2, 3]), CLOCK_ID);
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });

  it("buildPurchaseIntel splits coin and calls purchase", () => {
    const tx = new Transaction();
    buildPurchaseIntel(tx, FAKE_LISTING, 100_000_000, CLOCK_ID);
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(2); // splitCoins + moveCall
  });

  it("buildDelistIntel adds moveCall", () => {
    const tx = new Transaction();
    buildDelistIntel(tx, FAKE_LISTING);
    expect(tx.getData().commands.length).toBe(1);
  });

  it("buildExpireListing adds moveCall", () => {
    const tx = new Transaction();
    buildExpireListing(tx, FAKE_LISTING, CLOCK_ID);
    expect(tx.getData().commands.length).toBe(1);
  });

  it("buildUpdatePrice adds moveCall", () => {
    const tx = new Transaction();
    buildUpdatePrice(tx, FAKE_LISTING, 200_000_000);
    expect(tx.getData().commands.length).toBe(1);
  });
});
