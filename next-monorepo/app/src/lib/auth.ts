import { API_BASE_URL } from "./constants";
import { setJwt } from "./api-client";

const AUTH_STORAGE_KEY = "feh_jwt";
const NONCE_ENDPOINT = "/api/auth/nonce";
const VERIFY_ENDPOINT = "/api/auth/verify";

export interface AuthState {
  jwt: string | null;
  address: string | null;
  tier: "free" | "premium";
  expiresAt: number;
}

export async function authenticate(
  address: string,
  signMessage: (msg: Uint8Array) => Promise<{ signature: string }>
): Promise<AuthState> {
  const nonceRes = await fetch(`${API_BASE_URL}${NONCE_ENDPOINT}?address=${address}`);
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = new TextEncoder().encode(
    `Frontier Explorer Hub Authentication\nNonce: ${nonce}\nAddress: ${address}`
  );
  const { signature } = await signMessage(message);

  const verifyRes = await fetch(`${API_BASE_URL}${VERIFY_ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature, nonce })
  });

  if (!verifyRes.ok) throw new Error("Auth verification failed");
  const { jwt, tier, expiresAt } = (await verifyRes.json()) as {
    jwt: string;
    tier: "free" | "premium";
    expiresAt: number;
  };

  setJwt(jwt);
  if (typeof window !== "undefined") {
    sessionStorage.setItem(AUTH_STORAGE_KEY, jwt);
  }

  return { jwt, address, tier, expiresAt };
}

export function restoreSession(): string | null {
  if (typeof window === "undefined") return null;
  const jwt = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (jwt) setJwt(jwt);
  return jwt;
}

export function clearSession() {
  setJwt(null);
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }
}
