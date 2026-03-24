import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getRegionSummary: vi.fn(),
  getCharacter: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isPremium: false }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRegionActivity } from "@/hooks/use-region-activity";
import { useCharacterName, useCharacterNames } from "@/hooks/use-character";
import { getRegionSummary, getCharacter } from "@/lib/api-client";

const mockedRegion = vi.mocked(getRegionSummary);
const mockedChar = vi.mocked(getCharacter);

beforeEach(() => { mockedRegion.mockReset(); mockedChar.mockReset(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("EVE EYES monkey tests", () => {
  it("useRegionActivity handles NaN regionId gracefully", () => {
    const { result } = renderHook(() => useRegionActivity(NaN), { wrapper });
    expect(result.current.activity).toBeNull();
  });

  it("useRegionActivity handles negative regionId", async () => {
    mockedRegion.mockResolvedValue({
      regionId: -1,
      heatmap: { totalReports: 0, reporterCount: 0 },
      activity: null,
    });
    const { result } = renderHook(() => useRegionActivity(-1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activity).toBeNull();
  });

  it("useCharacterName handles empty string address", () => {
    const { result } = renderHook(() => useCharacterName(""), { wrapper });
    expect(result.current.name).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockedChar).not.toHaveBeenCalled();
  });

  it("useCharacterNames handles 50 addresses without crashing", async () => {
    mockedChar.mockImplementation(async (addr) => ({
      address: addr, name: `N-${addr}`, characterObjectId: null,
      profileObjectId: null, tribeId: null, itemId: null, tenant: null, description: null, avatarUrl: null,
      resolvedAt: Date.now(),
    }));
    const addrs = Array.from({ length: 50 }, (_, i) => `0x${i.toString(16).padStart(40, "0")}`);
    const { result } = renderHook(() => useCharacterNames(addrs), { wrapper });
    await waitFor(() => {
      expect(result.current.size).toBe(50);
      const entries = Array.from(result.current.values());
      expect(entries.every((v) => !v.isLoading)).toBe(true);
    });
    expect(result.current.size).toBe(50);
  });

  it("useCharacterNames handles all-duplicate array", async () => {
    mockedChar.mockResolvedValue({
      address: "0xsame", name: "Same", characterObjectId: null,
      profileObjectId: null, tribeId: null, itemId: null, tenant: null, description: null, avatarUrl: null,
      resolvedAt: Date.now(),
    });
    const addrs = Array(10).fill("0xsame");
    const { result } = renderHook(() => useCharacterNames(addrs), { wrapper });
    await waitFor(() => {
      expect(result.current.get("0xsame")?.name).toBe("Same");
    });
    expect(result.current.size).toBe(1);
    expect(mockedChar).toHaveBeenCalledTimes(1); // dedup
  });

  it("useCharacterName handles response with all-null optional fields", async () => {
    mockedChar.mockResolvedValue({
      address: "0xnull",
      name: null,
      characterObjectId: null,
      profileObjectId: null,
      tribeId: null,
      itemId: null,
      tenant: null,
      description: null,
      avatarUrl: null,
      resolvedAt: Date.now(),
    });
    const { result } = renderHook(() => useCharacterName("0xnull"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBeNull();
  });

  it("useRegionActivity with extreme activity values", async () => {
    mockedRegion.mockResolvedValue({
      regionId: 1,
      heatmap: { totalReports: 999999, reporterCount: 0 },
      activity: {
        defenseIndex: 999, infraIndex: -5, trafficIndex: 0,
        activePlayers: 0, windowStart: 0, windowEnd: 0, updatedAt: 0,
      },
    });
    const { result } = renderHook(() => useRegionActivity(1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activity!.defenseIndex).toBe(999);
    expect(result.current.activity!.infraIndex).toBe(-5);
    expect(result.current.isStale).toBe(true); // updatedAt=0 is ancient
  });
});
