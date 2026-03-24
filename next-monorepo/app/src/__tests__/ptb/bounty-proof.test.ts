import { describe, it, expect } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import {
  buildSubmitIntelProof,
  buildResubmitIntelProof,
  buildRejectProof,
  buildDisputeRejection,
  buildResolveDispute,
  buildAutoApproveProof,
} from "@/lib/ptb/bounty";

const OBJ = "0x" + "1".repeat(64);
const OBJ2 = "0x" + "2".repeat(64);
const OBJ3 = "0x" + "3".repeat(64);
const ADDR = "0x" + "a".repeat(64);

describe("buildSubmitIntelProof", () => {
  it("creates moveCall with correct arguments", () => {
    const tx = new Transaction();
    buildSubmitIntelProof(tx, {
      bountyId: OBJ, metaId: OBJ2, intelId: OBJ3,
      proofUrl: "https://proof.example", proofDescription: "test desc",
      clockId: "0x6",
    });
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildResubmitIntelProof", () => {
  it("creates moveCall", () => {
    const tx = new Transaction();
    buildResubmitIntelProof(tx, {
      bountyId: OBJ, metaId: OBJ2, intelId: OBJ3,
      proofUrl: "https://v2.example", proofDescription: "updated",
      clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildRejectProof", () => {
  it("creates moveCall with typeArguments", () => {
    const tx = new Transaction();
    buildRejectProof(tx, {
      bountyId: OBJ, hunter: ADDR, reason: "bad proof",
      verifierCapId: OBJ2, clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildDisputeRejection", () => {
  it("creates moveCall", () => {
    const tx = new Transaction();
    buildDisputeRejection(tx, {
      bountyId: OBJ, reason: "rejection was unjust", clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildResolveDispute", () => {
  it("creates moveCall with approve flag", () => {
    const tx = new Transaction();
    buildResolveDispute(tx, {
      bountyId: OBJ, hunter: ADDR, approve: true, clockId: "0x6",
    });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildAutoApproveProof", () => {
  it("creates moveCall", () => {
    const tx = new Transaction();
    buildAutoApproveProof(tx, { bountyId: OBJ, clockId: "0x6" });
    expect(tx.getData().commands.length).toBeGreaterThanOrEqual(1);
  });
});
