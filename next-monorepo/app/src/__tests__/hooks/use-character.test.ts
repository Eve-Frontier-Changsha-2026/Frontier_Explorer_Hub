import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getCharacter: vi.fn(),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useCharacterName, useCharacterNames } from "@/hooks/use-character";
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
      address: "0xabc", name: "DarkPilot", characterObjectId: "0xobj", resolvedAt: Date.now(),
    });
    const { result } = renderHook(() => useCharacterName("0xabc"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBe("DarkPilot");
    expect(result.current.isError).toBe(false);
  });

  it("returns null name for unresolvable address", async () => {
    mocked.mockResolvedValue({
      address: "0xunknown", name: null, characterObjectId: null, resolvedAt: 0,
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
      address: addr, name: `Name-${addr.slice(-3)}`, characterObjectId: null, resolvedAt: Date.now(),
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
