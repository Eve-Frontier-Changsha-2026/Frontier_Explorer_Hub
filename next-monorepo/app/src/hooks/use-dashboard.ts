"use client";

import { useQuery } from "@tanstack/react-query";
import { getHeatmap, getRegionSummary } from "@/lib/api-client";
import { useAuth } from "./use-auth";
import type { AggregatedCell } from "@/types";
import { useState } from "react";

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface FeedItem {
  id: string;
  system: number;
  note: string;
  risk: RiskLevel;
  ts: string;
}

function severityToRisk(severity: number): RiskLevel {
  if (severity >= 8) return "CRITICAL";
  if (severity >= 5) return "HIGH";
  if (severity >= 3) return "MEDIUM";
  return "LOW";
}

export function cellsToFeedItems(cells: AggregatedCell[]): FeedItem[] {
  return [...cells]
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    .slice(0, 10)
    .map((cell, i) => ({
      id: `INT-${cell.cell.regionId}-${i}`,
      system: cell.cell.regionId,
      note: `${cell.totalReports} reports from ${cell.reporterCount} sources in sector ${cell.cell.sectorX},${cell.cell.sectorY}`,
      risk: severityToRisk(cell.avgSeverity ?? 0),
      ts: new Date(cell.latestTimestamp).toISOString().slice(11, 16),
    }));
}

export function useDashboard() {
  const { isAuthenticated } = useAuth();
  const [regionId, setRegionId] = useState(0);

  const heatmap = useQuery({
    queryKey: ["heatmap", 0, isAuthenticated],
    queryFn: () => getHeatmap(0),
    staleTime: 30_000,
  });

  const regionSummary = useQuery({
    queryKey: ["regionSummary", regionId],
    queryFn: () => getRegionSummary(regionId),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const cells = heatmap.data?.cells ?? [];
  const feedItems = cellsToFeedItems(cells);

  const stats = {
    totalReports: cells.reduce((sum, c) => sum + c.totalReports, 0),
    alertCount: cells.filter((c) => (c.avgSeverity ?? 0) >= 5).length,
    activeRegions: new Set(cells.map((c) => c.cell.regionId)).size,
  };

  return {
    feedItems,
    stats,
    regionSummary: regionSummary.data,
    regionId,
    setRegionId,
    isLoading: heatmap.isLoading,
    isError: heatmap.isError,
  };
}
