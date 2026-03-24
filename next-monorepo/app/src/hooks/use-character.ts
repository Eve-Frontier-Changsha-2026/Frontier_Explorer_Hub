"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { getCharacter } from "@/lib/api-client";
import { useMemo } from "react";
import type { CharacterInfo } from "@/types";

const CHARACTER_STALE_TIME = 24 * 60 * 60 * 1000;

/** Full CharacterInfo — primary hook */
export function useCharacter(address: string | null) {
  return useQuery({
    queryKey: ["character", address],
    queryFn: () => getCharacter(address!),
    enabled: !!address,
    staleTime: CHARACTER_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/** Batch full CharacterInfo */
export function useCharacters(addresses: string[]) {
  const key = addresses.slice().sort().join(",");
  const unique = useMemo(() => [...new Set(addresses)], [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const queries = useQueries({
    queries: unique.map((addr) => ({
      queryKey: ["character", addr],
      queryFn: () => getCharacter(addr),
      staleTime: CHARACTER_STALE_TIME,
      refetchOnWindowFocus: false,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, CharacterInfo>();
    unique.forEach((addr, i) => {
      const d = queries[i]?.data;
      if (d) map.set(addr, d);
    });
    return map;
  }, [unique, queries]);
}

// ── Backwards-compatible wrappers ────────────────────────────

/** @deprecated Use `useCharacter` instead */
export function useCharacterName(address: string | null) {
  const query = useCharacter(address);
  return {
    name: query.data?.name ?? null,
    isLoading: !!address && query.isLoading,
    isError: query.isError,
  };
}

/** @deprecated Use `useCharacters` instead */
export function useCharacterNames(addresses: string[]) {
  const charMap = useCharacters(addresses);
  return useMemo(() => {
    const map = new Map<string, { name: string | null; isLoading: boolean }>();
    for (const addr of addresses) {
      const info = charMap.get(addr);
      map.set(addr, {
        name: info?.name ?? null,
        isLoading: !info,
      });
    }
    return map;
  }, [charMap, addresses]);
}
