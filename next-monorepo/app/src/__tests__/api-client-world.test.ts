import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getWorldStatus, getWorldCharacter, getWorldTribe } from "@/lib/api-client";

describe("World API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getWorldStatus calls correct endpoint", async () => {
    const mockStatus = { players: { registered: 185 }, updatedAt: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const result = await getWorldStatus();
    expect(result.players.registered).toBe(185);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/world/status"),
      expect.any(Object),
    );
  });

  it("getWorldCharacter calls correct endpoint", async () => {
    const id = "0x" + "a".repeat(64);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id, name: "sun" }),
    });

    const result = await getWorldCharacter(id);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/world/character/${id}`),
      expect.any(Object),
    );
  });

  it("getWorldTribe calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1000167, name: "CO86" }),
    });

    await getWorldTribe(1000167);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/world/tribe/1000167"),
      expect.any(Object),
    );
  });
});
