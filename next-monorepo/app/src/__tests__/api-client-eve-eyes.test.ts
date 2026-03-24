import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRegionSummary, getCharacter, setJwt } from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  setJwt(null);
});

describe("getRegionSummary", () => {
  const mockResponse = {
    regionId: 42,
    heatmap: { totalReports: 10, reporterCount: 3 },
    activity: {
      defenseIndex: 55,
      infraIndex: 30,
      trafficIndex: 72,
      activePlayers: 8,
      windowStart: 1711234567000,
      windowEnd: 1711238167000,
      updatedAt: 1711238167000,
    },
  };

  it("calls correct endpoint and returns RegionSummary", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
    const result = await getRegionSummary(42);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/region/42/summary"),
      expect.any(Object),
    );
  });

  it("returns null activity when no data", async () => {
    const noActivity = { ...mockResponse, activity: null };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(noActivity) });
    const result = await getRegionSummary(42);
    expect(result.activity).toBeNull();
  });
});

describe("getCharacter", () => {
  it("calls correct endpoint and returns CharacterInfo", async () => {
    const mockChar = {
      address: "0xabc123",
      name: "DarkPilot",
      characterObjectId: "0xobj456",
      resolvedAt: 1711238167000,
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockChar) });
    const result = await getCharacter("0xabc123");
    expect(result).toEqual(mockChar);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/character/0xabc123"),
      expect.any(Object),
    );
  });

  it("returns null name for unresolvable address", async () => {
    const unknown = { address: "0xunknown", name: null, characterObjectId: null, resolvedAt: 0 };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(unknown) });
    const result = await getCharacter("0xunknown");
    expect(result.name).toBeNull();
  });
});
