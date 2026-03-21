"use client";

import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { useCallback, useEffect, useState } from "react";
import { authenticate, clearSession, restoreSession, type AuthState } from "@/lib/auth";

const INITIAL_STATE: AuthState = { jwt: null, address: null, tier: "free", expiresAt: 0 };

function safeDecodeJwt(jwt: string): { exp?: number; tier?: "free" | "premium" } | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part)) as { exp?: number; tier?: "free" | "premium" };
    return payload;
  } catch {
    return null;
  }
}

export function useAuth() {
  const account = useCurrentAccount();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const [auth, setAuth] = useState<AuthState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const jwt = restoreSession();
    if (!jwt || !account?.address) return;
    const payload = safeDecodeJwt(jwt);
    if (payload?.exp && payload.exp * 1000 > Date.now()) {
      setAuth({
        jwt,
        address: account.address,
        tier: payload.tier ?? "free",
        expiresAt: payload.exp * 1000
      });
    } else {
      clearSession();
    }
  }, [account?.address]);

  useEffect(() => {
    if (!account) {
      clearSession();
      setAuth(INITIAL_STATE);
    }
  }, [account]);

  const login = useCallback(async () => {
    if (!account?.address) return;
    setIsLoading(true);
    setError(null);
    try {
      const state = await authenticate(account.address, async (msg) => {
        const result = await signMessage({ message: msg });
        return { signature: result.signature };
      });
      setAuth(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, signMessage]);

  const logout = useCallback(() => {
    clearSession();
    setAuth(INITIAL_STATE);
  }, []);

  return {
    ...auth,
    isAuthenticated: !!auth.jwt,
    isPremium: auth.tier === "premium",
    isLoading,
    error,
    login,
    logout
  };
}
