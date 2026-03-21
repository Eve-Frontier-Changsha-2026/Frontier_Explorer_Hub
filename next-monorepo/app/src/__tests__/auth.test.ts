import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticate, restoreSession, clearSession } from "@/lib/auth";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.clear();
});

describe("auth", () => {
  it("full auth flow: nonce -> sign -> verify -> returns JWT", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nonce: "abc123" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ jwt: "jwt.token.here", tier: "premium", expiresAt: Date.now() + 86400000 })
      });

    const signMessage = vi.fn().mockResolvedValue({ signature: "sig" });
    const result = await authenticate("0xABC", signMessage);

    expect(result.jwt).toBe("jwt.token.here");
    expect(result.tier).toBe("premium");
    expect(signMessage).toHaveBeenCalledOnce();
  });

  it("clearSession removes stored JWT", () => {
    sessionStorage.setItem("feh_jwt", "old-jwt");
    clearSession();
    expect(restoreSession()).toBeNull();
  });
});
