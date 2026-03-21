import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { buildUsePlugin } from "@/lib/ptb/marketplace";

describe("buildUsePlugin", () => {
  it("creates a transaction with use_plugin move call", () => {
    const tx = new Transaction();
    buildUsePlugin(
      tx,
      "0x4444444444444444444444444444444444444444444444444444444444444444",
      50_000_000,
      "0x6"
    );
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
