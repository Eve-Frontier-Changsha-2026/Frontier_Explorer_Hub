import { describe, it, expect, vi } from "vitest";

vi.mock("@mysten/dapp-kit", () => ({
  useSignAndExecuteTransaction: () => ({ mutateAsync: vi.fn() }),
  useCurrentAccount: () => ({ address: "0xcreator" }),
  useSuiClient: () => ({
    getOwnedObjects: vi.fn().mockResolvedValue({ data: [] }),
  }),
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
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/lib/api-client", () => ({
  getBountyDetail: vi.fn().mockResolvedValue({
    bounty: {
      bountyId: "0xbounty1",
      creator: "0xcreator",
      targetRegion: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
      intelTypesWanted: [0],
      rewardAmount: 1000,
      deadline: Date.now() + 86400000,
      status: 2,
      submissionCount: 1,
      metaId: "0xmeta",
      updatedAt: Date.now(),
      events: [
        {
          id: 1,
          bountyId: "0xbounty1",
          eventType: "proof_submitted",
          hunter: "0xhunter",
          actor: null,
          detail: { proofUrl: "https://proof" },
          timestamp: Date.now() - 3600000,
          txDigest: "tx1",
        },
      ],
      hunters: [{ hunter: "0xhunter", stakeAmount: 500 }],
    },
  }),
}));

vi.mock("@/lib/ptb/bounty", () => ({
  buildSubmitIntelProof: vi.fn((tx: unknown) => tx),
  buildResubmitIntelProof: vi.fn((tx: unknown) => tx),
  buildRejectProof: vi.fn((tx: unknown) => tx),
  buildDisputeRejection: vi.fn((tx: unknown) => tx),
  buildResolveDispute: vi.fn((tx: unknown) => tx),
  buildAutoApproveProof: vi.fn((tx: unknown) => tx),
}));

describe("useBountyDetail", () => {
  it("returns null bounty when useQuery returns no data", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.bounty).toBeNull();
    expect(result.isLoading).toBe(false);
  });

  it("role is 'viewer' when no bounty data", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.role).toBe("viewer");
  });

  it("currentProofStatus is null when no bounty data", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.currentProofStatus).toBeNull();
  });

  it("reviewDeadline is null when no bounty data", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.reviewDeadline).toBeNull();
  });

  it("exposes all mutation functions", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(typeof result.submitProof).toBe("function");
    expect(typeof result.resubmitProof).toBe("function");
    expect(typeof result.rejectProof).toBe("function");
    expect(typeof result.disputeRejection).toBe("function");
    expect(typeof result.resolveDispute).toBe("function");
    expect(typeof result.autoApproveProof).toBe("function");
  });

  it("isSubmitting is false initially", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.isSubmitting).toBe(false);
  });

  it("verifierCapId is null when no cap found", async () => {
    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.verifierCapId).toBeNull();
  });
});

describe("useBountyDetail — with bounty data (useQuery returns data)", () => {
  it("role is 'creator' when walletAddress matches creator", async () => {
    // Override useQuery to return bounty data
    const { useQuery: _useQuery, ...rest } = await import("@tanstack/react-query");
    void _useQuery;
    void rest;

    const reactQuery = await import("@tanstack/react-query");
    vi.spyOn(reactQuery, "useQuery").mockImplementation((opts: { queryKey?: readonly unknown[] }) => {
      const key = opts.queryKey?.[0];
      if (key === "bounty") {
        return {
          data: {
            bounty: {
              bountyId: "0xbounty1",
              creator: "0xcreator",
              targetRegion: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
              intelTypesWanted: [0],
              rewardAmount: 1000,
              deadline: Date.now() + 86400000,
              status: 2,
              submissionCount: 1,
              metaId: "0xmeta",
              updatedAt: Date.now(),
              events: [],
              hunters: [],
            },
          },
          isLoading: false,
        } as never;
      }
      return { data: undefined, isLoading: false } as never;
    });

    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.role).toBe("creator");
    expect(result.bounty).not.toBeNull();
  });

  it("role is 'hunter' when walletAddress matches a hunter event", async () => {
    const reactQuery = await import("@tanstack/react-query");
    vi.spyOn(reactQuery, "useQuery").mockImplementation((opts: { queryKey?: readonly unknown[] }) => {
      const key = opts.queryKey?.[0];
      if (key === "bounty") {
        return {
          data: {
            bounty: {
              bountyId: "0xbounty1",
              creator: "0xother",
              targetRegion: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
              intelTypesWanted: [0],
              rewardAmount: 1000,
              deadline: Date.now() + 86400000,
              status: 2,
              submissionCount: 1,
              metaId: "0xmeta",
              updatedAt: Date.now(),
              events: [
                {
                  id: 1,
                  bountyId: "0xbounty1",
                  eventType: "proof_submitted",
                  hunter: "0xcreator", // wallet address is "0xcreator" per mock
                  actor: null,
                  detail: { proofUrl: "https://proof" },
                  timestamp: Date.now() - 3600000,
                  txDigest: "tx1",
                },
              ],
              hunters: [{ hunter: "0xcreator", stakeAmount: 500 }],
            },
          },
          isLoading: false,
        } as never;
      }
      return { data: undefined, isLoading: false } as never;
    });

    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.role).toBe("hunter");
  });

  it("reviewDeadline is calculated from last proof_submitted event", async () => {
    const now = Date.now();
    const eventTs = now - 3600000;
    const reactQuery = await import("@tanstack/react-query");
    vi.spyOn(reactQuery, "useQuery").mockImplementation((opts: { queryKey?: readonly unknown[] }) => {
      const key = opts.queryKey?.[0];
      if (key === "bounty") {
        return {
          data: {
            bounty: {
              bountyId: "0xbounty1",
              creator: "0xcreator",
              targetRegion: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
              intelTypesWanted: [0],
              rewardAmount: 1000,
              deadline: now + 86400000,
              status: 2,
              submissionCount: 1,
              metaId: "0xmeta",
              updatedAt: now,
              events: [
                {
                  id: 1,
                  bountyId: "0xbounty1",
                  eventType: "proof_submitted",
                  hunter: "0xhunter",
                  actor: null,
                  detail: { proofUrl: "https://proof" },
                  timestamp: eventTs,
                  txDigest: "tx1",
                },
              ],
              hunters: [],
            },
          },
          isLoading: false,
        } as never;
      }
      return { data: undefined, isLoading: false } as never;
    });

    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    // REVIEW_PERIOD_MS = 259_200_000
    expect(result.reviewDeadline).toBe(eventTs + 259_200_000);
  });

  it("currentProofStatus reflects latest hunter event", async () => {
    const now = Date.now();
    const reactQuery = await import("@tanstack/react-query");
    vi.spyOn(reactQuery, "useQuery").mockImplementation((opts: { queryKey?: readonly unknown[] }) => {
      const key = opts.queryKey?.[0];
      if (key === "bounty") {
        return {
          data: {
            bounty: {
              bountyId: "0xbounty1",
              creator: "0xother",
              targetRegion: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
              intelTypesWanted: [0],
              rewardAmount: 1000,
              deadline: now + 86400000,
              status: 3,
              submissionCount: 1,
              metaId: "0xmeta",
              updatedAt: now,
              events: [
                {
                  id: 1,
                  bountyId: "0xbounty1",
                  eventType: "proof_submitted",
                  hunter: "0xcreator",
                  actor: null,
                  detail: { proofUrl: "https://proof" },
                  timestamp: now - 7200000,
                  txDigest: "tx1",
                },
                {
                  id: 2,
                  bountyId: "0xbounty1",
                  eventType: "proof_rejected",
                  hunter: "0xcreator",
                  actor: "0xother",
                  detail: { reason: "bad proof" },
                  timestamp: now - 3600000,
                  txDigest: "tx2",
                },
              ],
              hunters: [],
            },
          },
          isLoading: false,
        } as never;
      }
      return { data: undefined, isLoading: false } as never;
    });

    const { useBountyDetail } = await import("@/hooks/use-bounty-detail");
    const result = useBountyDetail("0xbounty1");
    expect(result.currentProofStatus).toBe("proof_rejected");
  });
});
