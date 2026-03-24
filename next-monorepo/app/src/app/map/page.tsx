"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useHeatmap } from "@/hooks/use-heatmap";
import { useMapStore } from "@/stores/map-store";
import { useDashboard } from "@/hooks/use-dashboard";
import { RegionActivityPanel } from "@/components/RegionActivityPanel";

type MapTab = "ef-map" | "heatmap";

function parseRegionId(selected: string | null): number | null {
  if (!selected) return null;
  const n = parseInt(selected.split("-")[0]!, 10);
  return isNaN(n) ? null : n;
}

export default function MapPage() {
  const { cells, effectiveZoom, isZoomLimited, isLoading } = useHeatmap();
  const { feedItems } = useDashboard();
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const [tab, setTab] = useState<MapTab>("ef-map");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="TACTICAL CONFLICT MAP"
        subtitle="Map control surface with tier-aware zoom behavior and live intel stream."
        metrics={[
          { label: "Zoom Level", value: String(effectiveZoom) },
          { label: "Visible Cells", value: String(cells.length) },
          { label: "Loading", value: isLoading ? "Yes" : "No" },
        ]}
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        {/* Main Column */}
        <div className="grid gap-3">
          {/* Map Controls */}
          <Panel title="Map Controls" badge={`Zoom ${effectiveZoom}`}>
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                className={`border px-3 py-2 text-xs uppercase tracking-wide cursor-pointer ${
                  tab === "ef-map"
                    ? "border-eve-gold/60 text-eve-gold bg-[rgba(28,21,16,0.6)]"
                    : "border-eve-panel-border text-eve-muted bg-[rgba(12,16,24,0.95)] hover:text-eve-text"
                }`}
                onClick={() => setTab("ef-map")}
              >
                Conflict Map
              </button>
              <button
                className={`border px-3 py-2 text-xs uppercase tracking-wide cursor-pointer ${
                  tab === "heatmap"
                    ? "border-eve-gold/60 text-eve-gold bg-[rgba(28,21,16,0.6)]"
                    : "border-eve-panel-border text-eve-muted bg-[rgba(12,16,24,0.95)] hover:text-eve-text"
                }`}
                onClick={() => setTab("heatmap")}
              >
                Intel Heatmap
              </button>
              <span className="border-l border-eve-panel-border mx-1" />
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-muted hover:text-eve-text px-3 py-2 text-xs uppercase tracking-wide cursor-pointer"
                onClick={() => setZoomLevel(zoomLevel - 1)}
              >
                Zoom Out
              </button>
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-muted hover:text-eve-text px-3 py-2 text-xs uppercase tracking-wide cursor-pointer"
                onClick={() => setZoomLevel(zoomLevel + 1)}
              >
                Zoom In
              </button>
            </div>
            {isZoomLimited && (
              <p className="mt-2 text-[0.73rem] text-eve-warn animate-flicker">
                Current tier limits deeper zoom. Upgrade to Premium for full depth.
              </p>
            )}
          </Panel>

          {/* Region Activity Overview */}
          <div className="border border-eve-panel-border/30 bg-eve-panel/50 p-2">
            <RegionActivityPanel regionId={parseRegionId(selected) ?? 0} compact />
          </div>

          {/* Map View */}
          <Panel title={tab === "ef-map" ? "Conflict Map" : "Intel Heatmap"} badge={tab === "ef-map" ? "External Embed" : `${cells.length} cells`}>
            {tab === "ef-map" ? (
              <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1">
                <iframe
                  className="w-full min-h-[400px] border-0 block"
                  src="https://ef-map.com/embed?embed=1"
                  title="EVE Frontier map"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1 min-h-[400px] bg-eve-stars relative">
                {isLoading ? (
                  <p className="text-[0.73rem] text-eve-muted p-4">Loading heatmap data...</p>
                ) : cells.length === 0 ? (
                  <p className="text-[0.73rem] text-eve-muted p-4">No heatmap data available. Submit intel to populate.</p>
                ) : (
                  <div className="p-4">
                    <p className="text-[0.73rem] text-eve-muted mb-2">
                      deck.gl HeatmapLayer renders here. {cells.length} cells loaded at zoom {effectiveZoom}.
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {cells.slice(0, 12).map((cell, i) => (
                        <div
                          key={i}
                          className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.6)] p-1.5 text-[0.6rem] text-eve-muted cursor-pointer hover:border-eve-glow"
                          onClick={() => setSelected(`${cell.cell.regionId}-${i}`)}
                        >
                          <strong className="text-eve-cold block">R-{cell.cell.regionId}</strong>
                          <span>{cell.totalReports} reports</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* Sidebar Column */}
        <div className="grid gap-3 content-start">
          <Panel title="Selected Intel" badge={selected ?? "none"}>
            <p className="mt-2 text-[0.73rem] text-eve-muted/80">
              {selected ? `Viewing cell ${selected}` : "Click a cell or feed item to inspect."}
            </p>
          </Panel>

          <RegionActivityPanel regionId={parseRegionId(selected)} />

          <Panel title="Live Feed" badge={String(feedItems.length)}>
            <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
              {feedItems.map((item) => (
                <button
                  key={item.id}
                  className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2 text-left w-full cursor-pointer hover:border-eve-glow/40 transition-colors"
                  onClick={() => setSelected(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{item.id}</strong>
                    <RiskBadge risk={item.risk} />
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">{item.note}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">SYS-{item.system}</span>
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.ts} UTC</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
