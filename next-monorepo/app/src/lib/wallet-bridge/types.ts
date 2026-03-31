// ── Source identifiers ──
export const WALLET_BRIDGE_SOURCE_HOST = "feh-wallet-host" as const;
export const WALLET_BRIDGE_SOURCE_CHILD = "feh-wallet-child" as const;

// ── Host → Child messages ──
export interface WalletStateMessage {
  source: typeof WALLET_BRIDGE_SOURCE_HOST;
  type: "wallet:state";
  address: string;
  network: string;
}

export interface WalletDisconnectMessage {
  source: typeof WALLET_BRIDGE_SOURCE_HOST;
  type: "wallet:disconnect";
}

export interface WalletSignResponse {
  source: typeof WALLET_BRIDGE_SOURCE_HOST;
  type: "wallet:sign-response";
  id: string;
  digest?: string;
  error?: string;
}

export type HostMessage = WalletStateMessage | WalletDisconnectMessage | WalletSignResponse;

// ── Child → Host messages ──
export interface WalletConnectRequest {
  source: typeof WALLET_BRIDGE_SOURCE_CHILD;
  type: "wallet:connect-request";
}

export interface WalletSignRequest {
  source: typeof WALLET_BRIDGE_SOURCE_CHILD;
  type: "wallet:sign-request";
  id: string;
  txBytes: string; // base64-encoded TransactionBlock bytes
}

export type ChildMessage = WalletConnectRequest | WalletSignRequest;

// ── Origin whitelist ──
const ALLOWED_ORIGINS = new Set([
  "https://bounty-escrow-protocol.vercel.app",
  "https://wreckage-insurance-protocol.vercel.app",
  "https://astro-logistics-network.vercel.app",
  "https://industrial-auto-os.vercel.app",
]);

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" && url.protocol === "http:") return true;
  } catch {
    // invalid URL
  }
  return false;
}
