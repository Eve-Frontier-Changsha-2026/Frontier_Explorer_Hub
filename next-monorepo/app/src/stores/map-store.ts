import { create } from "zustand";

export interface MapFilters {
  intelTypes: number[];
  severityMin: number;
  timeRangeMs: number | null;
}

export interface MapState {
  zoomLevel: number;
  centerRegionId: number | null;
  viewportBounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  showHeatmap: boolean;
  showMarkers: boolean;
  showRoutes: boolean;
  filters: MapFilters;
  selectedIntelId: string | null;
  selectedRegionId: number | null;
  setZoomLevel: (z: number) => void;
  setCenterRegion: (id: number | null) => void;
  setViewportBounds: (bounds: MapState["viewportBounds"]) => void;
  toggleLayer: (layer: "heatmap" | "markers" | "routes") => void;
  setFilters: (f: Partial<MapFilters>) => void;
  selectIntel: (id: string | null) => void;
  selectRegion: (id: number | null) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: MapFilters = {
  intelTypes: [],
  severityMin: 0,
  timeRangeMs: null
};

export const useMapStore = create<MapState>((set) => ({
  zoomLevel: 0,
  centerRegionId: null,
  viewportBounds: null,
  showHeatmap: true,
  showMarkers: false,
  showRoutes: false,
  filters: { ...DEFAULT_FILTERS },
  selectedIntelId: null,
  selectedRegionId: null,
  setZoomLevel: (z) => set({ zoomLevel: Math.min(2, Math.max(0, z)) }),
  setCenterRegion: (id) => set({ centerRegionId: id }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  toggleLayer: (layer) =>
    set((s) => {
      if (layer === "heatmap") return { showHeatmap: !s.showHeatmap };
      if (layer === "markers") return { showMarkers: !s.showMarkers };
      return { showRoutes: !s.showRoutes };
    }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  selectIntel: (id) => set({ selectedIntelId: id }),
  selectRegion: (id) => set({ selectedRegionId: id }),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } })
}));
