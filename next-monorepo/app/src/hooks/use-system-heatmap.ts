"use client";

import { useQuery } from "@tanstack/react-query";
import { getSystemHeatmap } from "@/lib/api-client";
import { useMemo } from "react";
import { buildScene, buildBackgroundStars } from "@/lib/system-heatmap-scene";

export function useSystemHeatmap() {
  const query = useQuery({
    queryKey: ["systemHeatmap"],
    queryFn: getSystemHeatmap,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const scene = useMemo(() => {
    if (!query.data) return null;
    return buildScene(query.data.systems, query.data.links);
  }, [query.data]);

  const stars = useMemo(() => {
    if (!scene) return [];
    return buildBackgroundStars(scene.nodes);
  }, [scene]);

  return {
    nodes: scene?.nodes ?? [],
    links: scene?.links ?? [],
    stars,
    isLoading: query.isLoading,
    isError: query.isError,
    generatedAt: query.data?.generatedAt ?? null,
  };
}
