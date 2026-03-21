import { describe, it, expect, beforeEach } from "vitest";
import { useMapStore } from "@/stores/map-store";

beforeEach(() => {
  useMapStore.setState({
    zoomLevel: 0,
    centerRegionId: null,
    viewportBounds: null,
    showHeatmap: true,
    showMarkers: false,
    showRoutes: false,
    filters: { intelTypes: [], severityMin: 0, timeRangeMs: null },
    selectedIntelId: null,
    selectedRegionId: null
  });
});

describe("map-store", () => {
  it("clamps zoom level to 0-2", () => {
    useMapStore.getState().setZoomLevel(5);
    expect(useMapStore.getState().zoomLevel).toBe(2);

    useMapStore.getState().setZoomLevel(-1);
    expect(useMapStore.getState().zoomLevel).toBe(0);
  });

  it("toggles layers independently", () => {
    useMapStore.getState().toggleLayer("markers");
    expect(useMapStore.getState().showMarkers).toBe(true);
    expect(useMapStore.getState().showHeatmap).toBe(true);
  });

  it("merges partial filter updates", () => {
    useMapStore.getState().setFilters({ severityMin: 5 });
    expect(useMapStore.getState().filters.severityMin).toBe(5);
    expect(useMapStore.getState().filters.intelTypes).toEqual([]);
  });

  it("resetFilters restores defaults", () => {
    useMapStore.getState().setFilters({ severityMin: 8, intelTypes: [1, 2] });
    useMapStore.getState().resetFilters();
    expect(useMapStore.getState().filters.severityMin).toBe(0);
    expect(useMapStore.getState().filters.intelTypes).toEqual([]);
  });
});
