import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getHeatmap: vi.fn().mockResolvedValue({
    cells: [
      { cell: { regionId: 1, sectorX: 10, sectorY: 20, sectorZ: 0, zoomLevel: 0 }, totalReports: 5, reporterCount: 3, suppressed: false, avgSeverity: 7, latestTimestamp: Date.now() },
      { cell: { regionId: 2, sectorX: 30, sectorY: 40, sectorZ: 0, zoomLevel: 0 }, totalReports: 2, reporterCount: 1, suppressed: false, avgSeverity: 3, latestTimestamp: Date.now() },
    ],
    tier: "free",
  }),
  getRegionSummary: vi.fn().mockResolvedValue({
    regionId: 0,
    totalReports: 7,
    byType: { 0: 3, 1: 4 },
    activeBounties: 2,
  }),
}));

import { cellsToFeedItems } from "@/hooks/use-dashboard";

describe("cellsToFeedItems", () => {
  it("converts aggregated cells to feed items sorted by timestamp desc", () => {
    const cells = [
      { cell: { regionId: 1, sectorX: 10, sectorY: 20, sectorZ: 0, zoomLevel: 0 }, totalReports: 5, reporterCount: 3, suppressed: false, avgSeverity: 7, latestTimestamp: 1000 },
      { cell: { regionId: 2, sectorX: 30, sectorY: 40, sectorZ: 0, zoomLevel: 0 }, totalReports: 2, reporterCount: 1, suppressed: false, avgSeverity: 3, latestTimestamp: 2000 },
    ];
    const items = cellsToFeedItems(cells);
    expect(items).toHaveLength(2);
    expect(items[0].system).toBe(2); // higher timestamp first
    expect(items[0].risk).toBe("MEDIUM");
    expect(items[1].risk).toBe("HIGH");
  });
});
