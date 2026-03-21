"use client";

import { useQuery } from "@tanstack/react-query";
import { getHeatmap } from "@/lib/api-client";
import { useMapStore } from "@/stores/map-store";
import { useAuth } from "./use-auth";
import { TIER_LIMITS, TIERS } from "@/lib/constants";
import type { AggregatedCell } from "@/types";

export function filterCells(
  cells: AggregatedCell[],
  filters: { intelTypes: number[]; severityMin: number; timeRangeMs: number | null }
): AggregatedCell[] {
  return cells.filter((cell) => {
    if (cell.suppressed) return false;
    if (filters.intelTypes.length > 0 && cell.byType) {
      const hasMatchingType = filters.intelTypes.some((t) => (cell.byType?.[t] ?? 0) > 0);
      if (!hasMatchingType) return false;
    }
    if (filters.severityMin > 0 && cell.avgSeverity != null && cell.avgSeverity < filters.severityMin) {
      return false;
    }
    if (filters.timeRangeMs != null) {
      const cutoff = Date.now() - filters.timeRangeMs;
      if (cell.latestTimestamp < cutoff) return false;
    }
    return true;
  });
}

export function useHeatmap() {
  const { isPremium, isAuthenticated } = useAuth();
  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const filters = useMapStore((s) => s.filters);
  const tier = isPremium ? TIERS.PREMIUM : TIERS.FREE;
  const effectiveZoom = Math.min(zoomLevel, TIER_LIMITS[tier].maxZoom);

  const query = useQuery({
    queryKey: ["heatmap", effectiveZoom, isAuthenticated],
    queryFn: () => getHeatmap(effectiveZoom),
    refetchInterval: isPremium ? 10_000 : 60_000,
    staleTime: isPremium ? 5_000 : 30_000
  });

  const filtered = filterCells(query.data?.cells ?? [], filters);

  return {
    cells: filtered,
    allCells: query.data?.cells ?? [],
    tier: query.data?.tier ?? "free",
    isLoading: query.isLoading,
    isError: query.isError,
    effectiveZoom,
    isZoomLimited: zoomLevel > TIER_LIMITS[tier].maxZoom
  };
}
