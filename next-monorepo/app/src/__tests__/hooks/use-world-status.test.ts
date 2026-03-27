import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/api-client", () => ({
  getWorldStatus: vi.fn(),
}));

import { useWorldStatus } from "@/hooks/use-world-status";
import { getWorldStatus } from "@/lib/api-client";

const mockGetWorldStatus = vi.mocked(getWorldStatus);

const mockWorldStatus = {
  players: { registered: 185, active: 23, newLast24h: 3, sources: [{ provider: "utopia", fetchedAt: Date.now(), stale: false }] },
  combat: { kills24h: 8, activeSystems: 3, recentKills: [], sources: [] },
  infrastructure: { onlineAssemblies: 64, totalAssemblies: 100, infraIndex: 2.1, sources: [] },
  defense: { defenseIndex: 4.2, sources: [] },
  traffic: { trafficIndex: 6.8, sources: [] },
  factions: { count: 12, largest: { name: "Clonebank 86", ticker: "CO86", members: 150 }, sources: [] },
  updatedAt: Date.now(),
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useWorldStatus", () => {
  beforeEach(() => {
    mockGetWorldStatus.mockResolvedValue(mockWorldStatus as any);
  });

  it("returns world status data", async () => {
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.players.registered).toBe(185);
    expect(result.current.worldStatus?.defense.defenseIndex).toBe(4.2);
  });
});
