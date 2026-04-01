import { Transaction } from "@mysten/sui/transactions";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;
const CLOCK_ID = "0x6";

// ═══════════════════════════════════════════════
// Sell Mode
// ═══════════════════════════════════════════════

export function buildListIntel(
  tx: Transaction,
  params: {
    title: string;
    regionId: number;
    sectorX: number;
    sectorY: number;
    sectorZ: number;
    intelType: number;
    severity: number;
    expiryMs: number;
    priceMist: number;
    feeMist: number;
  },
) {
  const [feeCoin] = tx.splitCoins(tx.gas, [params.feeMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::list_intel`,
    arguments: [
      tx.pure.vector("u8", new TextEncoder().encode(params.title)),
      tx.pure.u64(params.regionId),
      tx.pure.u64(params.sectorX),
      tx.pure.u64(params.sectorY),
      tx.pure.u64(params.sectorZ),
      tx.pure.u8(params.intelType),
      tx.pure.u8(params.severity),
      tx.pure.u64(params.expiryMs),
      tx.pure.u64(params.priceMist),
      feeCoin,
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildSetEncryptedPayload(
  tx: Transaction,
  params: { listingId: string; encryptedBytes: Uint8Array },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::set_encrypted_payload`,
    arguments: [
      tx.object(params.listingId),
      tx.pure.vector("u8", Array.from(params.encryptedBytes)),
    ],
  });
}

export function buildPurchaseIntel(
  tx: Transaction,
  params: { listingId: string; priceMist: number },
) {
  const [paymentCoin] = tx.splitCoins(tx.gas, [params.priceMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::purchase_intel`,
    arguments: [
      tx.object(params.listingId),
      paymentCoin,
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildConfirmAndRate(
  tx: Transaction,
  params: { listingId: string; profileId: string; rating: number },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::confirm_and_rate`,
    arguments: [
      tx.object(params.listingId),
      tx.object(params.profileId),
      tx.pure.u8(params.rating),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAutoRelease(
  tx: Transaction,
  params: { listingId: string; profileId: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::auto_release`,
    arguments: [
      tx.object(params.listingId),
      tx.object(params.profileId),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildCancelListing(
  tx: Transaction,
  params: { listingId: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::cancel_listing`,
    arguments: [tx.object(params.listingId)],
  });
}

// ═══════════════════════════════════════════════
// Bounty Mode
// ═══════════════════════════════════════════════

export function buildPostRequest(
  tx: Transaction,
  params: {
    title: string;
    intelType: number;
    regionId: number;
    description: string;
    rewardMist: number;
    deadlineMs: number;
  },
) {
  const [rewardCoin] = tx.splitCoins(tx.gas, [params.rewardMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::post_request`,
    arguments: [
      tx.pure.vector("u8", new TextEncoder().encode(params.title)),
      tx.pure.u8(params.intelType),
      tx.pure.u64(params.regionId),
      tx.pure.vector("u8", new TextEncoder().encode(params.description)),
      rewardCoin,
      tx.pure.u64(params.deadlineMs),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildFulfillRequest(
  tx: Transaction,
  params: { requestId: string; encryptedPayload: Uint8Array },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::fulfill_request`,
    arguments: [
      tx.object(params.requestId),
      tx.pure.vector("u8", Array.from(params.encryptedPayload)),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAcceptAndRate(
  tx: Transaction,
  params: {
    requestId: string;
    profileId: string;
    sellerAddr: string;
    rating: number;
  },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::accept_and_rate`,
    arguments: [
      tx.object(params.requestId),
      tx.object(params.profileId),
      tx.pure.address(params.sellerAddr),
      tx.pure.u8(params.rating),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAutoSettle(
  tx: Transaction,
  params: { requestId: string; profileId: string; firstSellerAddr: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::auto_settle_request`,
    arguments: [
      tx.object(params.requestId),
      tx.object(params.profileId),
      tx.pure.address(params.firstSellerAddr),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildCancelRequest(
  tx: Transaction,
  params: { requestId: string },
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::cancel_request`,
    arguments: [tx.object(params.requestId)],
  });
}
