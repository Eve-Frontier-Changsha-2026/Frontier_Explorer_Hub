import { SealClient, SessionKey, EncryptedObject } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, toHex } from "@mysten/sui/utils";
// Use loose type for SuiClient — dapp-kit may return SuiJsonRpcClient or SuiClient
// depending on @mysten/sui version; both are structurally compatible at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySuiClient = any;

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;

// Testnet key servers (from Seal docs)
const TESTNET_KEY_SERVERS = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

let _client: SealClient | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SuiClient is structurally compatible with SealCompatibleClient
export function getSealClient(suiClient: AnySuiClient): SealClient {
  if (!_client) {
    _client = new SealClient({
      suiClient,
      serverConfigs: TESTNET_KEY_SERVERS,
      verifyKeyServers: false,
    });
  }
  return _client;
}

/**
 * Build a Seal encrypt id: objectId bytes (32) + 5 random nonce bytes, as hex string.
 * The contract's seal_approve does prefix match on the first 32 bytes.
 */
function buildSealId(objectId: string): string {
  // objectId is "0x..." hex string (32 bytes = 64 hex chars + "0x" prefix)
  const nonce = crypto.getRandomValues(new Uint8Array(5));
  const nonceHex = toHex(nonce);
  // Strip "0x" from objectId, append nonce hex (also strip "0x")
  const objHex = objectId.startsWith("0x") ? objectId.slice(2) : objectId;
  const nHex = nonceHex.startsWith("0x") ? nonceHex.slice(2) : nonceHex;
  return objHex + nHex;
}

/**
 * Encrypt plaintext for a given namespace object (listing or request).
 * @param namespaceId - hex object ID (listing or request "0x...")
 */
export async function sealEncrypt(
  suiClient: AnySuiClient,
  plaintext: string,
  namespaceId: string,
): Promise<Uint8Array> {
  const client = getSealClient(suiClient);
  const id = buildSealId(namespaceId);
  const { encryptedObject } = await client.encrypt({
    threshold: 2,
    packageId: PACKAGE_ID,
    id,
    data: new TextEncoder().encode(plaintext),
  });
  return encryptedObject;
}

// ═══════════════════════════════════════════════
// Decrypt helpers
// ═══════════════════════════════════════════════

/**
 * Create a session key for decrypt operations.
 * Requires one wallet signature (personal message).
 */
export async function createSessionKey(
  suiClient: AnySuiClient,
  address: string,
  signPersonalMessage: (params: { message: Uint8Array }) => Promise<{ signature: string }>,
): Promise<SessionKey> {
  const sessionKey = await SessionKey.create({
    address,
    packageId: PACKAGE_ID,
    ttlMin: 10,
    suiClient: suiClient as any,
  });
  const message = sessionKey.getPersonalMessage();
  const { signature } = await signPersonalMessage({ message });
  await sessionKey.setPersonalMessageSignature(signature);
  return sessionKey;
}

/**
 * Decrypt listing intel after purchase.
 * Builds a seal_approve_listing TX (not executed — only bytes sent to key server).
 */
export async function sealDecryptListing(
  suiClient: AnySuiClient,
  sessionKey: SessionKey,
  encryptedPayload: Uint8Array,
  receiptId: string,
): Promise<{ exactCoords: { x: string; y: string; z: string }; description: string }> {
  const client = getSealClient(suiClient);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::seal_approve_listing`,
    arguments: [
      tx.pure.vector("u8", Array.from(fromHex(EncryptedObject.parse(encryptedPayload).id))),
      tx.object(receiptId),
    ],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  const decryptedBytes = await client.decrypt({
    data: encryptedPayload,
    sessionKey,
    txBytes,
  });
  return JSON.parse(new TextDecoder().decode(decryptedBytes));
}

/**
 * Decrypt bounty intel after accept.
 * Builds a seal_approve_request TX (not executed).
 */
export async function sealDecryptRequest(
  suiClient: AnySuiClient,
  sessionKey: SessionKey,
  encryptedPayload: Uint8Array,
  receiptId: string,
): Promise<{ exactCoords: { x: string; y: string; z: string }; description: string }> {
  const client = getSealClient(suiClient);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::seal_approve_request`,
    arguments: [
      tx.pure.vector("u8", Array.from(fromHex(EncryptedObject.parse(encryptedPayload).id))),
      tx.object(receiptId),
    ],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  const decryptedBytes = await client.decrypt({
    data: encryptedPayload,
    sessionKey,
    txBytes,
  });
  return JSON.parse(new TextDecoder().decode(decryptedBytes));
}
