import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, SHARED_OBJECTS } from "../constants";

export function buildListIntel(
  tx: Transaction,
  intelId: string,
  priceMist: number,
  maxBuyers: number,
  expiryMs: number,
  encryptedPayload: Uint8Array,
  clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::list_intel`,
    arguments: [
      tx.object(intelId),
      tx.pure.u64(priceMist),
      tx.pure.u64(maxBuyers),
      tx.pure.u64(expiryMs),
      tx.pure.vector("u8", Array.from(encryptedPayload)),
      tx.object(SHARED_OBJECTS.marketConfig),
      tx.object(clockId),
    ],
  });
  return tx;
}

export function buildPurchaseIntel(
  tx: Transaction,
  listingId: string,
  priceMist: number,
  clockId: string,
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::market::purchase_intel`,
    arguments: [
      tx.object(listingId),
      paymentCoin,
      tx.object(SHARED_OBJECTS.marketConfig),
      tx.object(clockId),
    ],
  });
  return tx;
}

export function buildDelistIntel(
  tx: Transaction,
  listingId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::delist_intel`,
    arguments: [tx.object(listingId)],
  });
  return tx;
}

export function buildExpireListing(
  tx: Transaction,
  listingId: string,
  clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::expire_listing`,
    arguments: [tx.object(listingId), tx.object(clockId)],
  });
  return tx;
}

export function buildUpdatePrice(
  tx: Transaction,
  listingId: string,
  newPriceMist: number,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::update_price`,
    arguments: [
      tx.object(listingId),
      tx.pure.u64(newPriceMist),
      tx.object(SHARED_OBJECTS.marketConfig),
    ],
  });
  return tx;
}
