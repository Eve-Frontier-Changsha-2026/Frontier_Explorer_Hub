import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, BOUNTY_ESCROW_PACKAGE_ID, SUI_TYPE } from "../constants";
import type { GridCell } from "@/types";

export function buildCreateBounty(
  tx: Transaction,
  targetRegion: GridCell,
  intelTypesWanted: number[],
  rewardMist: number,
  deadlineMs: number,
  clockId: string
): Transaction {
  const [rewardCoin] = tx.splitCoins(tx.gas, [rewardMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::create_bounty`,
    arguments: [
      rewardCoin,
      tx.pure.u64(targetRegion.regionId),
      tx.pure.u64(targetRegion.sectorX),
      tx.pure.u64(targetRegion.sectorY),
      tx.pure.u64(targetRegion.sectorZ),
      tx.pure.u8(targetRegion.zoomLevel),
      tx.pure.vector("u8", intelTypesWanted),
      tx.pure.u64(deadlineMs),
      tx.object(clockId)
    ]
  });

  return tx;
}

/** @deprecated Use buildSubmitIntelProof instead */
export function buildSubmitForBounty(tx: Transaction, bountyId: string, intelId: string, clockId: string): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::submit_for_bounty`,
    arguments: [tx.object(bountyId), tx.object(intelId), tx.object(clockId)]
  });
  return tx;
}

export function buildRefundExpiredBounty(tx: Transaction, bountyId: string, clockId: string): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::refund_expired_bounty`,
    arguments: [tx.object(bountyId), tx.object(clockId)]
  });
  return tx;
}

// ── Proof/Dispute builders (new) ─────────────────────────────

export function buildSubmitIntelProof(
  tx: Transaction,
  params: {
    bountyId: string; metaId: string; intelId: string;
    proofUrl: string; proofDescription: string; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::submit_intel_proof`,
    arguments: [
      tx.object(params.bountyId),
      tx.object(params.metaId),
      tx.object(params.intelId),
      tx.pure.string(params.proofUrl),
      tx.pure.string(params.proofDescription),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildResubmitIntelProof(
  tx: Transaction,
  params: {
    bountyId: string; metaId: string; intelId: string;
    proofUrl: string; proofDescription: string; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::resubmit_intel_proof`,
    arguments: [
      tx.object(params.bountyId),
      tx.object(params.metaId),
      tx.object(params.intelId),
      tx.pure.string(params.proofUrl),
      tx.pure.string(params.proofDescription),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildRejectProof(
  tx: Transaction,
  params: {
    bountyId: string; hunter: string; reason: string;
    verifierCapId: string; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::reject_proof`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.pure.address(params.hunter),
      tx.pure.string(params.reason),
      tx.object(params.verifierCapId),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildDisputeRejection(
  tx: Transaction,
  params: { bountyId: string; reason: string; clockId: string },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::dispute_rejection`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.pure.string(params.reason),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildResolveDispute(
  tx: Transaction,
  params: {
    bountyId: string; hunter: string; approve: boolean; clockId: string;
  },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::resolve_dispute`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.pure.address(params.hunter),
      tx.pure.bool(params.approve),
      tx.object(params.clockId),
    ],
  });
  return tx;
}

export function buildAutoApproveProof(
  tx: Transaction,
  params: { bountyId: string; clockId: string },
): Transaction {
  tx.moveCall({
    target: `${BOUNTY_ESCROW_PACKAGE_ID}::bounty::auto_approve_proof`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx.object(params.bountyId),
      tx.object(params.clockId),
    ],
  });
  return tx;
}
