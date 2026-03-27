import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useWorldStatus monkey tests", () => {
  it("handles null/undefined fields in response", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockResolvedValue({
        players: { registered: 0, active: 0, newLast24h: 0, sources: [] },
        combat: { kills24h: 0, activeSystems: 0, recentKills: [], sources: [] },
        infrastructure: { onlineAssemblies: 0, totalAssemblies: 0, infraIndex: 0, sources: [] },
        defense: { defenseIndex: 0, sources: [] },
        traffic: { trafficIndex: 0, sources: [] },
        factions: { count: 0, largest: { name: "", ticker: "", members: 0 }, sources: [] },
        updatedAt: 0,
      }),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.factions.largest.name).toBe("");
  });

  it("handles API error gracefully", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockRejectedValue(new Error("Network error")),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.worldStatus).toBeNull();
  });

  it("handles kill entries with zero timestamps", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockResolvedValue({
        players: { registered: 1, active: 0, newLast24h: 0, sources: [] },
        combat: {
          kills24h: 1,
          activeSystems: 1,
          recentKills: [
            { id: "0x1", killerName: "", victimName: "", killerId: "0x2", victimId: "0x3", lossType: "", solarSystemId: 0, killedAt: 0 },
          ],
          sources: [],
        },
        infrastructure: { onlineAssemblies: 0, totalAssemblies: 0, infraIndex: 0, sources: [] },
        defense: { defenseIndex: 0, sources: [] },
        traffic: { trafficIndex: 0, sources: [] },
        factions: { count: 0, largest: { name: "", ticker: "", members: 0 }, sources: [] },
        updatedAt: 0,
      }),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.combat.recentKills[0].killedAt).toBe(0);
  });

  it("handles extremely large numbers", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockResolvedValue({
        players: { registered: Number.MAX_SAFE_INTEGER, active: Number.MAX_SAFE_INTEGER, newLast24h: 0, sources: [] },
        combat: { kills24h: 999999, activeSystems: 999999, recentKills: [], sources: [] },
        infrastructure: { onlineAssemblies: 999999, totalAssemblies: 999999, infraIndex: Infinity, sources: [] },
        defense: { defenseIndex: NaN, sources: [] },
        traffic: { trafficIndex: -Infinity, sources: [] },
        factions: { count: 0, largest: { name: "x".repeat(10000), ticker: "x".repeat(100), members: 0 }, sources: [] },
        updatedAt: Date.now(),
      }),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.players.registered).toBe(Number.MAX_SAFE_INTEGER);
  });
});
