import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBountyDetail, getBountiesByCreator, getBountiesByHunter, setJwt } from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => { mockFetch.mockReset(); setJwt(null); });

describe("bounty API client", () => {
  it("getBountyDetail calls correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bounty: { bountyId: "0x1", events: [] } }),
    });
    const result = await getBountyDetail("0x1");
    expect(result.bounty.bountyId).toBe("0x1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bounties/0x1"),
      expect.anything(),
    );
  });

  it("getBountiesByCreator calls correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bounties: [] }),
    });
    await getBountiesByCreator("0xabc");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bounties/by-creator/0xabc"),
      expect.anything(),
    );
  });

  it("getBountiesByHunter calls correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ bounties: [] }),
    });
    await getBountiesByHunter("0xdef");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/bounties/by-hunter/0xdef"),
      expect.anything(),
    );
  });
});
