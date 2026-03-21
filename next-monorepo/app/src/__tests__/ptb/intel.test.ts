import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { buildSubmitIntel } from "@/lib/ptb/intel";

describe("buildSubmitIntel", () => {
  it("creates a transaction with submit_intel move call", () => {
    const tx = new Transaction();
    buildSubmitIntel(
      tx,
      {
        location: { regionId: 1, sectorX: 100, sectorY: 200, sectorZ: 50, zoomLevel: 1 },
        rawLocationHash: [1, 2, 3],
        intelType: 0,
        severity: 5,
        expiryMs: Date.now() + 86400000,
        visibility: 0
      },
      "0x6"
    );
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
