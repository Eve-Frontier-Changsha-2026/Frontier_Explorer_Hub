"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { getCharacter } from "@/lib/api-client";
import { useMemo } from "react";

const CHARACTER_STALE_TIME = 24 * 60 * 60 * 1000;

export function useCharacterName(address: string | null) {
  const query = useQuery({
    queryKey: ["character", address],
    queryFn: () => getCharacter(address!),
    enabled: !!address,
    staleTime: CHARACTER_STALE_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    name: query.data?.name ?? null,
    isLoading: !!address && query.isLoading,
    isError: query.isError,
  };
}

export function useCharacterNames(addresses: string[]) {
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
    const map = new Map<string, { name: string | null; isLoading: boolean }>();
    unique.forEach((addr, i) => {
      map.set(addr, {
        name: queries[i]?.data?.name ?? null,
        isLoading: queries[i]?.isLoading ?? false,
      });
    });
    return map;
  }, [unique, queries]);
}
