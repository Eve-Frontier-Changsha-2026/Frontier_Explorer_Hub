import { describe, it, expect } from "vitest";
import { filterCells } from "@/hooks/use-heatmap";
import type { AggregatedCell } from "@/types";

describe("heatmap filter logic", () => {
  const baseCell: AggregatedCell = {
    cell: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
    totalReports: 10,
    reporterCount: 5,
    suppressed: false,
    byType: { 0: 5, 1: 3, 2: 2 },
    avgSeverity: 6,
    latestTimestamp: Date.now()
  };

  it("filters suppressed cells", () => {
    const cells = [{ ...baseCell, suppressed: true }];
    expect(filterCells(cells, { intelTypes: [], severityMin: 0, timeRangeMs: null })).toEqual([]);
  });

  it("filters by intel type", () => {
    const cells = [baseCell];
    expect(filterCells(cells, { intelTypes: [3], severityMin: 0, timeRangeMs: null })).toEqual([]);
    expect(filterCells(cells, { intelTypes: [0], severityMin: 0, timeRangeMs: null })).toHaveLength(1);
  });

  it("filters by severity", () => {
    expect(filterCells([baseCell], { intelTypes: [], severityMin: 7, timeRangeMs: null })).toEqual([]);
    expect(filterCells([baseCell], { intelTypes: [], severityMin: 5, timeRangeMs: null })).toHaveLength(1);
  });
});
