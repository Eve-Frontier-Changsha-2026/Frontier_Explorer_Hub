import { describe, it, expect, vi, beforeEach } from "vitest";
import { getHeatmap, getIntel, ApiError, setJwt } from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  setJwt(null);
});

describe("api-client", () => {
  it("getHeatmap sends correct URL and returns data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cells: [], tier: "free" })
    });
    const result = await getHeatmap(1);
    expect(result).toEqual({ cells: [], tier: "free" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/heatmap/1"),
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
  });

  it("attaches JWT header when set", async () => {
    setJwt("test-jwt-token");
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await getIntel("0x123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-jwt-token" })
      })
    );
  });

  it("throws ApiError on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () => Promise.resolve({ error: "Premium required" })
    });
    await expect(getHeatmap(2)).rejects.toThrow(ApiError);
    await expect(getHeatmap(2)).rejects.toMatchObject({ status: 403 });
  });
});
