import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID } from "../constants";
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
