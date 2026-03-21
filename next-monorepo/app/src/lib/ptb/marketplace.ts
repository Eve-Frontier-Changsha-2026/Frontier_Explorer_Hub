import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, SHARED_OBJECTS } from "../constants";

export function buildUsePlugin(
  tx: Transaction,
  pluginId: string,
  priceMist: number,
  clockId: string
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::use_plugin`,
    arguments: [
      tx.object(SHARED_OBJECTS.pluginRegistry),
      tx.pure.address(pluginId),
      paymentCoin,
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      tx.object(clockId)
    ]
  });

  return tx;
}
