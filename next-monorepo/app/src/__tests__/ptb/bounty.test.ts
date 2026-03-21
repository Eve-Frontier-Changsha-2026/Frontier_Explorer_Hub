import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { buildCreateBounty, buildSubmitForBounty } from "@/lib/ptb/bounty";

describe("buildCreateBounty", () => {
  it("creates a transaction with create_bounty move call", () => {
    const tx = new Transaction();
    buildCreateBounty(
      tx,
      { regionId: 1, sectorX: 10, sectorY: 20, sectorZ: 5, zoomLevel: 1 },
      [0, 1],
      1_000_000_000,
      Date.now() + 86400000,
      "0x6"
    );
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildSubmitForBounty", () => {
  it("creates a transaction with submit_for_bounty move call", () => {
    const tx = new Transaction();
    buildSubmitForBounty(
      tx,
      "0x2222222222222222222222222222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333333333333333333333333333",
      "0x6"
    );
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(1);
  });
});
