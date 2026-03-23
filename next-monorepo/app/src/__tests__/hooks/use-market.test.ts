import { describe, it, expect, vi } from "vitest";

vi.mock("@mysten/dapp-kit", () => ({
  useSignAndExecuteTransaction: () => ({ mutateAsync: vi.fn() }),
  useCurrentAccount: () => null,
  useSignPersonalMessage: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: (opts: { mutationFn: unknown }) => ({ mutateAsync: opts.mutationFn, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/stores/ui-store", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: vi.fn(), setPendingTx: vi.fn() }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock("@/lib/api-client", () => ({
  getMarketListings: vi.fn().mockResolvedValue({ listings: [] }),
}));

describe("useMarket", () => {
  it("returns empty listings when no data", async () => {
    const { useMarket } = await import("@/hooks/use-market");
    const result = useMarket();
    expect(result.listings).toEqual([]);
    expect(result.isLoading).toBe(false);
  });

  it("exposes mutation functions", async () => {
    const { useMarket } = await import("@/hooks/use-market");
    const result = useMarket();
    expect(typeof result.listIntel).toBe("function");
    expect(typeof result.purchaseIntel).toBe("function");
    expect(typeof result.delistIntel).toBe("function");
    expect(typeof result.updatePrice).toBe("function");
  });
});
