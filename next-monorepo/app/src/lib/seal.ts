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
let _sessionKey: SessionKey | null = null;
let _sessionKeyExpiry = 0;
let _sessionKeyAddress = "";

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
 * Get or create a cached session key (10-min TTL).
 * Only prompts wallet signature if no valid cached key exists.
 */
export async function getOrCreateSessionKey(
  suiClient: AnySuiClient,
  address: string,
  signPersonalMessage: (params: { message: Uint8Array }) => Promise<{ signature: string }>,
): Promise<SessionKey> {
  if (_sessionKey && Date.now() < _sessionKeyExpiry && _sessionKeyAddress === address) return _sessionKey;
  const sk = await createSessionKey(suiClient, address, signPersonalMessage);
  _sessionKey = sk;
  _sessionKeyExpiry = Date.now() + 9 * 60 * 1000; // 9 min (slightly under 10-min TTL)
  _sessionKeyAddress = address;
  return sk;
}

/**
 * Decrypt a listing's encrypted payload using an existing session key (no extra signature).
 */
export async function sealDecryptListingWithKey(
  suiClient: AnySuiClient,
  sessionKey: SessionKey,
  listingId: string,
  receiptId: string,
  receiptRef?: { objectId: string; version: string; digest: string },
): Promise<{ exactCoords: { x: string; y: string; z: string } | null; description: string }> {
  const getObj = (id: string) =>
    (suiClient as { getObject: (opts: { id: string; options: { showContent: boolean } }) => Promise<{ data?: { content?: { dataType: string; fields: Record<string, unknown> } } }> }).getObject({
      id,
      options: { showContent: true },
    });

  // Fetch encrypted payload from chain
  const client = getSealClient(suiClient);
  const obj = await getObj(listingId);
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") throw new Error("Listing not found");
  const fields = content.fields as Record<string, unknown>;
  const payloadArr = fields.encrypted_payload as number[];
  if (!payloadArr || payloadArr.length === 0) throw new Error("No encrypted payload");
  const encryptedPayload = new Uint8Array(payloadArr);

  const tx = new Transaction();
  // Use objectRef when available (fresh purchase — fullnode may not have indexed yet)
  // Fall back to tx.object() for retry/manual decrypt (receipt already indexed)
  const receiptArg = receiptRef
    ? tx.objectRef({ objectId: receiptRef.objectId, version: receiptRef.version, digest: receiptRef.digest })
    : tx.object(receiptId);
  tx.moveCall({
    target: `${PACKAGE_ID}::intel_market::seal_approve_listing`,
    arguments: [
      tx.pure.vector("u8", Array.from(fromHex(EncryptedObject.parse(encryptedPayload).id))),
      receiptArg,
    ],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  const decryptedBytes = await client.decrypt({
    data: encryptedPayload,
    sessionKey,
    txBytes,
  });
  const text = new TextDecoder().decode(decryptedBytes);
  try {
    return JSON.parse(text);
  } catch {
    return { exactCoords: null, description: text };
  }
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
): Promise<{ exactCoords: { x: string; y: string; z: string } | null; description: string }> {
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
  const text = new TextDecoder().decode(decryptedBytes);
  try {
    return JSON.parse(text);
  } catch {
    return { exactCoords: null, description: text };
  }
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
): Promise<{ exactCoords: { x: string; y: string; z: string } | null; description: string }> {
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
  const text = new TextDecoder().decode(decryptedBytes);
  try {
    return JSON.parse(text);
  } catch {
    // Plain text submission (not JSON-structured)
    return { exactCoords: null, description: text };
  }
}
