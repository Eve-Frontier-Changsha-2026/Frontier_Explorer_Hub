import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { buildUnlockIntel } from "@/lib/ptb/access";

describe("buildUnlockIntel", () => {
  it("creates a transaction with unlock_intel move call and slippage param", () => {
    const tx = new Transaction();
    buildUnlockIntel(
      tx,
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      200_000_000,
      300_000_000,
      "0x6"
    );
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
