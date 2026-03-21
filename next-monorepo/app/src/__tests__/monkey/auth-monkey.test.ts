import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticate, restoreSession, clearSession } from "@/lib/auth";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.clear();
});

describe("auth monkey tests", () => {
  it("handles nonce endpoint returning non-JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error("not JSON"))
    });
    const sign = vi.fn();
    await expect(authenticate("0x1", sign)).rejects.toThrow();
  });

  it("handles signature rejection by wallet", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ nonce: "abc" })
    });
    const sign = vi.fn().mockRejectedValue(new Error("User rejected"));
    await expect(authenticate("0x1", sign)).rejects.toThrow("User rejected");
  });

  it("handles verify endpoint 500", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nonce: "abc" }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const sign = vi.fn().mockResolvedValue({ signature: "sig" });
    await expect(authenticate("0x1", sign)).rejects.toThrow();
  });

  it("restoreSession with corrupted JWT does not crash", () => {
    sessionStorage.setItem("feh_jwt", "not.a.valid.jwt");
    const jwt = restoreSession();
    expect(jwt).toBe("not.a.valid.jwt");
  });

  it("clearSession is idempotent", () => {
    clearSession();
    clearSession();
    expect(restoreSession()).toBeNull();
  });
});
