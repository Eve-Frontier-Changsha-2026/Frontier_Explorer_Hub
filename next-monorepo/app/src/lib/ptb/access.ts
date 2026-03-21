import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, SHARED_OBJECTS } from "../constants";

export function buildUnlockIntel(
  tx: Transaction,
  intelId: string,
  paymentMist: number,
  maxPriceMist: number,
  clockId: string
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [paymentMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::access::unlock_intel`,
    arguments: [
      tx.object(SHARED_OBJECTS.pricingTable),
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      tx.object(intelId),
      paymentCoin,
      tx.pure.u64(maxPriceMist),
      tx.object(clockId)
    ]
  });

  return tx;
}
