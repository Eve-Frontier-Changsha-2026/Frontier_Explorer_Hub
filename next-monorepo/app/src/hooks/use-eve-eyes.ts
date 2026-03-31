"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getEveEyesKillmails,
  getEveEyesLeaderboard,
  getEveEyesModulesSummary,
} from "@/lib/api-client";

export function useEveKillmails(limit = 20) {
  const query = useQuery({
    queryKey: ["eveEyesKillmails", limit],
    queryFn: () => getEveEyesKillmails(limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    killmails: query.data?.items ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useLeaderboard(limit = 10, moduleName?: string) {
  const query = useQuery({
    queryKey: ["eveEyesLeaderboard", limit, moduleName],
    queryFn: () => getEveEyesLeaderboard(limit, moduleName),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  return {
    leaderboard: query.data?.leaderboard ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useModulesSummary() {
  const query = useQuery({
    queryKey: ["eveEyesModulesSummary"],
    queryFn: getEveEyesModulesSummary,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  return {
    modules: query.data?.modules ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
