import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, SHARED_OBJECTS } from "../constants";

export function buildSubscribe(tx: Transaction, days: number, priceMist: number, clockId: string): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::subscription::subscribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      paymentCoin,
      tx.pure.u64(days),
      tx.object(clockId)
    ]
  });

  return tx;
}

export function buildRenew(
  tx: Transaction,
  nftId: string,
  days: number,
  priceMist: number,
  clockId: string
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::subscription::renew`,
    arguments: [
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      tx.object(nftId),
      paymentCoin,
      tx.pure.u64(days),
      tx.object(clockId)
    ]
  });

  return tx;
}
