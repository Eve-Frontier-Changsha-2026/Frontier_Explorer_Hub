import { describe, it, expect, vi } from "vitest";
import { ApiError, getHeatmap, getIntel } from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe("API client monkey tests", () => {
  it("handles network timeout (fetch throws)", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to fetch"));
    await expect(getHeatmap(0)).rejects.toThrow("Failed to fetch");
  });

  it("handles empty response body on error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: () => Promise.reject(new Error("no body"))
    });
    await expect(getHeatmap(0)).rejects.toThrow(ApiError);
  });

  it("handles zoom level out of range (negative)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ cells: [], tier: "free" }) });
    const result = await getHeatmap(-1);
    expect(result).toBeDefined();
  });

  it("handles extremely long intel ID", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ intel: null, locked: true }) });
    const longId = `0x${"a".repeat(1000)}`;
    const result = await getIntel(longId);
    expect(result).toBeDefined();
  });

  it("handles concurrent requests", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ cells: [], tier: "free" }) });
    const results = await Promise.all([getHeatmap(0), getHeatmap(1), getHeatmap(2)]);
    expect(results).toHaveLength(3);
  });
});
