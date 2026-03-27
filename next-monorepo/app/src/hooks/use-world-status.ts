"use client";

import { useQuery } from "@tanstack/react-query";
import { getWorldStatus } from "@/lib/api-client";

export function useWorldStatus() {
  const query = useQuery({
    queryKey: ["worldStatus"],
    queryFn: getWorldStatus,
    staleTime: 30_000,
    refetchInterval: 300_000,
  });

  return {
    worldStatus: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
