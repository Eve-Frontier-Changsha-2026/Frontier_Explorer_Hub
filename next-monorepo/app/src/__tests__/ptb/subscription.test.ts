import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { buildSubscribe } from "@/lib/ptb/subscription";

describe("buildSubscribe", () => {
  it("creates a transaction with subscribe move call", () => {
    const tx = new Transaction();
    buildSubscribe(tx, 30, 30_000_000_000, "0x6");
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
