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
  selectedSystemId: string | null;
  heatmapSidebarOpen: boolean;
  centerOnSystemId: string | null; // set to trigger centering, canvas clears after handling
  setZoomLevel: (z: number) => void;
  setCenterRegion: (id: number | null) => void;
  setViewportBounds: (bounds: MapState["viewportBounds"]) => void;
  toggleLayer: (layer: "heatmap" | "markers" | "routes") => void;
  setFilters: (f: Partial<MapFilters>) => void;
  selectIntel: (id: string | null) => void;
  selectRegion: (id: number | null) => void;
  selectSystem: (id: string | null) => void;
  toggleHeatmapSidebar: () => void;
  centerOnSystem: (id: string) => void;
  clearCenterOn: () => void;
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
  selectedSystemId: null,
  heatmapSidebarOpen: true,
  centerOnSystemId: null,
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
  selectSystem: (id) => set({ selectedSystemId: id }),
  toggleHeatmapSidebar: () => set((s) => ({ heatmapSidebarOpen: !s.heatmapSidebarOpen })),
  centerOnSystem: (id) => set({ centerOnSystemId: id, selectedSystemId: id, heatmapSidebarOpen: true }),
  clearCenterOn: () => set({ centerOnSystemId: null }),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } })
}));
