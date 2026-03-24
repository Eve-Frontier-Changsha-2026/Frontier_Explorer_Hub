import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getRegionSummary: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isPremium: false }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRegionActivity } from "@/hooks/use-region-activity";
import { getRegionSummary } from "@/lib/api-client";

const mocked = vi.mocked(getRegionSummary);

beforeEach(() => { mocked.mockReset(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const mockSummary = {
  regionId: 42,
  heatmap: { totalReports: 10, reporterCount: 3 },
  activity: {
    defenseIndex: 55, infraIndex: 30, trafficIndex: 72, activePlayers: 8,
    windowStart: Date.now() - 300_000, windowEnd: Date.now(), updatedAt: Date.now(),
  },
};

describe("useRegionActivity", () => {
  it("returns null when regionId is null", () => {
    const { result } = renderHook(() => useRegionActivity(null), { wrapper });
    expect(result.current.activity).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("fetches and returns activity for valid regionId", async () => {
    mocked.mockResolvedValue(mockSummary);
    const { result } = renderHook(() => useRegionActivity(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activity).toEqual(mockSummary.activity);
    expect(result.current.heatmap).toEqual(mockSummary.heatmap);
  });

  it("returns isStale=true when updatedAt is older than 10min", async () => {
    const stale = {
      ...mockSummary,
      activity: { ...mockSummary.activity!, updatedAt: Date.now() - 11 * 60 * 1000 },
    };
    mocked.mockResolvedValue(stale);
    const { result } = renderHook(() => useRegionActivity(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isStale).toBe(true);
  });

  it("returns isStale=false when activity is null", async () => {
    mocked.mockResolvedValue({ ...mockSummary, activity: null });
    const { result } = renderHook(() => useRegionActivity(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isStale).toBe(false);
  });
});
