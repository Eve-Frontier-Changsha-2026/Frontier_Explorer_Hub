import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/api-client", () => ({
  getEveEyesKillmails: vi.fn().mockResolvedValue({
    items: [{
      killmailItemId: "1", killTimestamp: "2026-03-30T21:17:32.000Z",
      lossType: "SHIP", solarSystemId: "30013131", resolutionStatus: "resolved",
      killer: { label: "sun", username: "sun", walletAddress: "0xa", characterItemId: "1" },
      victim: { label: "moon", username: "moon", walletAddress: "0xb", characterItemId: "2" },
    }],
  }),
  getEveEyesLeaderboard: vi.fn().mockResolvedValue({
    ok: true, leaderboard: [{ rank: 1, tenant: "utopia", ownerCharacterItemId: "1", userId: "1", walletAddress: "0xa", buildingCount: 54, lastSeenAt: "2026-03-26T12:48:36Z", username: "lacal" }],
  }),
  getEveEyesModulesSummary: vi.fn().mockResolvedValue({
    modules: [{ title: "Atlas", href: "/atlas", description: "Search", metric: "24502 systems", supporting: "2213 constellations", status: "live" }],
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("EVE Eyes hooks", () => {
  it("useEveKillmails returns killmail data", async () => {
    const { useEveKillmails } = await import("@/hooks/use-eve-eyes");
    const { result } = renderHook(() => useEveKillmails(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killmails).toHaveLength(1);
    expect(result.current.killmails![0].killmailItemId).toBe("1");
  });

  it("useLeaderboard returns leaderboard data", async () => {
    const { useLeaderboard } = await import("@/hooks/use-eve-eyes");
    const { result } = renderHook(() => useLeaderboard(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.leaderboard).toHaveLength(1);
    expect(result.current.leaderboard![0].username).toBe("lacal");
  });

  it("useModulesSummary returns modules data", async () => {
    const { useModulesSummary } = await import("@/hooks/use-eve-eyes");
    const { result } = renderHook(() => useModulesSummary(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modules).toHaveLength(1);
    expect(result.current.modules![0].title).toBe("Atlas");
  });
});
