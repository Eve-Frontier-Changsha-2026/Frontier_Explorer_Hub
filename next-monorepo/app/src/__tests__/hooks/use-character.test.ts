import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getCharacter: vi.fn(),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useCharacterName, useCharacterNames, useCharacter, useCharacters } from "@/hooks/use-character";
import { getCharacter } from "@/lib/api-client";

const mocked = vi.mocked(getCharacter);

beforeEach(() => { mocked.mockReset(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCharacterName", () => {
  it("returns null name when address is null", () => {
    const { result } = renderHook(() => useCharacterName(null), { wrapper });
    expect(result.current.name).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("resolves name for valid address", async () => {
    mocked.mockResolvedValue({
      address: "0xabc", name: "DarkPilot", characterObjectId: "0xobj",
      profileObjectId: null, tribeId: null, itemId: null, tenant: null, description: null, avatarUrl: null,
      resolvedAt: Date.now(),
    });
    const { result } = renderHook(() => useCharacterName("0xabc"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBe("DarkPilot");
    expect(result.current.isError).toBe(false);
  });

  it("returns null name for unresolvable address", async () => {
    mocked.mockResolvedValue({
      address: "0xunknown", name: null, characterObjectId: null,
      profileObjectId: null, tribeId: null, itemId: null, tenant: null, description: null, avatarUrl: null,
      resolvedAt: 0,
    });
    const { result } = renderHook(() => useCharacterName("0xunknown"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBeNull();
  });

  it("returns isError=true on API failure", async () => {
    mocked.mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() => useCharacterName("0xfail"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.name).toBeNull();
  });
});

describe("useCharacterNames", () => {
  it("returns empty map for empty array", () => {
    const { result } = renderHook(() => useCharacterNames([]), { wrapper });
    expect(result.current.size).toBe(0);
  });

  it("resolves multiple addresses with dedup", async () => {
    mocked.mockImplementation(async (addr) => ({
      address: addr, name: `Name-${addr.slice(-3)}`, characterObjectId: null,
      profileObjectId: null, tribeId: null, itemId: null, tenant: null, description: null, avatarUrl: null,
      resolvedAt: Date.now(),
    }));
    const addrs = ["0xaaa", "0xbbb", "0xaaa"];
    const { result } = renderHook(() => useCharacterNames(addrs), { wrapper });
    await waitFor(() => {
      expect(result.current.get("0xaaa")?.name).toBe("Name-aaa");
    });
    expect(result.current.size).toBe(2); // deduped
    expect(result.current.get("0xbbb")?.name).toBe("Name-bbb");
  });
});

describe("useCharacter", () => {
  it("returns full CharacterInfo", async () => {
    mocked.mockResolvedValue({
      address: "0xplayer",
      name: "murphy",
      characterObjectId: "0xchar",
      profileObjectId: "0xprof",
      tribeId: 1000167,
      itemId: "2112000186",
      tenant: "utopia",
      description: "A brave pilot",
      avatarUrl: "https://avatar.png",
      resolvedAt: Date.now(),
    });
    const { result } = renderHook(() => useCharacter("0xplayer"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.name).toBe("murphy");
    expect(result.current.data?.tribeId).toBe(1000167);
    expect(result.current.data?.tenant).toBe("utopia");
  });

  it("returns null data when address is null", () => {
    const { result } = renderHook(() => useCharacter(null), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useCharacters", () => {
  it("returns Map<string, CharacterInfo>", async () => {
    mocked.mockImplementation(async (addr) => ({
      address: addr,
      name: `Name-${addr.slice(-3)}`,
      characterObjectId: null,
      profileObjectId: null,
      tribeId: null,
      itemId: null,
      tenant: null,
      description: null,
      avatarUrl: null,
      resolvedAt: Date.now(),
    }));
    const { result } = renderHook(() => useCharacters(["0xaaa", "0xbbb"]), { wrapper });
    await waitFor(() => {
      expect(result.current.get("0xaaa")?.name).toBe("Name-aaa");
    });
    expect(result.current.get("0xaaa")?.tribeId).toBeNull();
  });
});
