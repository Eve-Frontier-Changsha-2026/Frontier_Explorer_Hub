"use client";

import { useCallback } from "react";
import { useMapStore } from "@/stores/map-store";
import type { MapViewport } from "@/types";

export function useMapViewport() {
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const setCenterRegion = useMapStore((s) => s.setCenterRegion);
  const setViewportBounds = useMapStore((s) => s.setViewportBounds);
  const zoomLevel = useMapStore((s) => s.zoomLevel);

  const onViewportChange = useCallback(
    (viewport: MapViewport) => {
      const discreteZoom = viewport.zoom < 3 ? 0 : viewport.zoom < 6 ? 1 : 2;
      if (discreteZoom !== zoomLevel) {
        setZoomLevel(discreteZoom);
      }
    },
    [zoomLevel, setZoomLevel]
  );

  return {
    onViewportChange,
    setZoomLevel,
    setCenterRegion,
    setViewportBounds,
    zoomLevel
  };
}
