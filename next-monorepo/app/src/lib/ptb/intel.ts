import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, MIN_SUBMIT_DEPOSIT_MIST } from "../constants";
import type { GridCell } from "@/types";

export interface SubmitIntelParams {
  location: GridCell;
  rawLocationHash: number[];
  intelType: number;
  severity: number;
  expiryMs: number;
  visibility: number;
  depositMist?: number;
}

export function buildSubmitIntel(tx: Transaction, params: SubmitIntelParams, clockId: string): Transaction {
  const deposit = params.depositMist ?? MIN_SUBMIT_DEPOSIT_MIST;
  const [depositCoin] = tx.splitCoins(tx.gas, [deposit]);

  tx.moveCall({
    target: `${PACKAGE_ID}::intel::submit_intel`,
    arguments: [
      tx.object(clockId),
      depositCoin,
      tx.pure.u64(params.location.regionId),
      tx.pure.u64(params.location.sectorX),
      tx.pure.u64(params.location.sectorY),
      tx.pure.u64(params.location.sectorZ),
      tx.pure.u8(params.location.zoomLevel),
      tx.pure.vector("u8", params.rawLocationHash),
      tx.pure.u8(params.intelType),
      tx.pure.u8(params.severity),
      tx.pure.u64(params.expiryMs),
      tx.pure.u8(params.visibility)
    ]
  });

  return tx;
}

export function buildExpireIntel(tx: Transaction, intelId: string): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel::expire_intel`,
    arguments: [tx.object(intelId)]
  });
  return tx;
}
