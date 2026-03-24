"use client";

import { useQuery } from "@tanstack/react-query";
import { getRegionSummary } from "@/lib/api-client";
import type { RegionActivity } from "@/types";

const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export function useRegionActivity(regionId: number | null) {
  const query = useQuery({
    queryKey: ["regionSummary", regionId],
    queryFn: () => getRegionSummary(regionId!),
    enabled: regionId != null && !Number.isNaN(regionId),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const activity: RegionActivity | null = query.data?.activity ?? null;
  const heatmap = query.data?.heatmap ?? null;
  const isStale = activity
    ? Date.now() - activity.updatedAt > STALE_THRESHOLD_MS
    : false;

  return {
    activity,
    heatmap,
    isLoading: regionId != null && !Number.isNaN(regionId) && query.isLoading,
    isError: query.isError,
    isStale,
  };
}
