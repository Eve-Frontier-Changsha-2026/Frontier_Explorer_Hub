"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { useHeatmap } from "@/hooks/use-heatmap";
import { useMapStore } from "@/stores/map-store";
import { useSystemHeatmap } from "@/hooks/use-system-heatmap";
import { RegionActivityPanel } from "@/components/RegionActivityPanel";
import { SystemHeatmapCanvas } from "@/components/SystemHeatmapCanvas";

type MapTab = "ef-map" | "heatmap";

const LABEL_COLORS = {
  kills: "#f87171",
  intel: "#22d3ee",
  gates: "#a78bfa",
  market: "#fbbf24",
} as const;

import type { SceneNode } from "@/lib/system-heatmap-scene";

function SidebarPanels({ selectedNode, selectedSystemId, nodes, selectSystem }: {
  selectedNode: SceneNode | null;
  selectedSystemId: string | null;
  nodes: SceneNode[];
  selectSystem: (id: string | null) => void;
}) {
  return (
    <div className="grid gap-3 content-start">
      <Panel title="Selected System" badge={selectedNode?.label ?? "none"}>
        {selectedNode ? (
          <div className="mt-2 space-y-2">
            <p className="text-[0.8rem] font-semibold text-eve-text">{selectedNode.label}</p>
            <div className="grid grid-cols-2 gap-1.5 text-[0.7rem]">
              <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.6)] p-1.5">
                <span style={{ color: LABEL_COLORS.kills }}>⚔ Kills</span>
                <strong className="block text-eve-text">{selectedNode.killCount}</strong>
              </div>
              <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.6)] p-1.5">
                <span style={{ color: LABEL_COLORS.intel }}>📡 Intel</span>
                <strong className="block text-eve-text">{selectedNode.intelCount}</strong>
              </div>
              <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.6)] p-1.5">
                <span style={{ color: LABEL_COLORS.gates }}>🚪 Gates</span>
                <strong className="block text-eve-text">{selectedNode.gateTraffic}</strong>
              </div>
              <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.6)] p-1.5">
                <span style={{ color: LABEL_COLORS.market }}>💰 Market</span>
                <strong className="block text-eve-text">{selectedNode.marketActivity}</strong>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[0.65rem] text-eve-muted">
              <span>Intensity: <strong className="text-eve-gold">{selectedNode.intensity}</strong>/100</span>
              <span>•</span>
              <span>Last event: {selectedNode.latestEventAt ? new Date(selectedNode.latestEventAt).toLocaleString() : "—"}</span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[0.73rem] text-eve-muted/80">Click a system node to inspect.</p>
        )}
      </Panel>

      <RegionActivityPanel regionId={selectedSystemId ? parseInt(selectedSystemId, 10) : null} />

      <Panel title="Systems" badge={String(nodes.length)}>
        <div className="mt-2 grid gap-1.5 max-h-80 overflow-y-auto">
          {nodes
            .slice()
            .sort((a, b) => b.intensity - a.intensity)
            .map((node) => (
            <button
              key={node.id}
              className={`border p-2 text-left w-full cursor-pointer transition-colors ${
                selectedSystemId === node.id
                  ? "border-eve-gold/60 bg-[rgba(28,21,16,0.5)]"
                  : "border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] hover:border-eve-glow/40"
              }`}
              onClick={() => selectSystem(node.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs text-eve-text">{node.label}</strong>
                <span className="text-[0.6rem] text-eve-gold">{node.intensity}/100</span>
              </div>
              <div className="mt-1 flex gap-2 text-[0.6rem] flex-wrap">
                {node.killCount > 0 && <span style={{ color: LABEL_COLORS.kills }}>⚔ {node.killCount}</span>}
                {node.intelCount > 0 && <span style={{ color: LABEL_COLORS.intel }}>📡 {node.intelCount}</span>}
                {node.gateTraffic > 0 && <span style={{ color: LABEL_COLORS.gates }}>🚪 {node.gateTraffic}</span>}
                {node.marketActivity > 0 && <span style={{ color: LABEL_COLORS.market }}>💰 {node.marketActivity}</span>}
              </div>
            </button>
          ))}
          {nodes.length === 0 && (
            <p className="text-[0.7rem] text-eve-muted p-2">No system data yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function MapPage() {
  const { cells, effectiveZoom, isZoomLimited, isLoading } = useHeatmap();
  const { nodes } = useSystemHeatmap();
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const selectedSystemId = useMapStore((s) => s.selectedSystemId);
  const selectSystem = useMapStore((s) => s.selectSystem);
  const centerOnSystem = useMapStore((s) => s.centerOnSystem);
  const heatmapSidebarOpen = useMapStore((s) => s.heatmapSidebarOpen);
  const toggleHeatmapSidebar = useMapStore((s) => s.toggleHeatmapSidebar);
  const [tab, setTab] = useState<MapTab>("ef-map");

  const selectedNode = selectedSystemId ? nodes.find((n) => n.id === selectedSystemId) ?? null : null;

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

      {/* Map Controls — always full width */}
      <div className="mt-3">
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
      </div>

      {tab === "ef-map" ? (
        /* ── Conflict Map: two-column layout ── */
        <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
          <div className="grid gap-3">
            <div className="border border-eve-panel-border/30 bg-eve-panel/50 p-2">
              <RegionActivityPanel regionId={selectedSystemId ? parseInt(selectedSystemId, 10) : 0} compact />
            </div>
            <Panel title="Conflict Map" badge="External Embed">
              <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1">
                <iframe
                  className="w-full min-h-[400px] border-0 block"
                  src="https://ef-map.com/embed?embed=1"
                  title="EVE Frontier map"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </Panel>
          </div>
          <SidebarPanels
            selectedNode={selectedNode}
            selectedSystemId={selectedSystemId}
            nodes={nodes}
            selectSystem={selectSystem}
          />
        </div>
      ) : (
        /* ── Intel Heatmap: full-width map + floating sidebar overlay ── */
        <div className="mt-3 relative">
          <Panel title="Intel Heatmap" badge={`${nodes.length} systems`}>
            <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-0 h-[70vh] min-h-[400px] relative">
              <SystemHeatmapCanvas />
              {/* Collapsed: small tab on right edge */}
              {!heatmapSidebarOpen && (
                <button
                  className="absolute top-2 right-0 z-20 border border-eve-panel-border border-r-0 bg-[rgba(7,10,15,0.92)] backdrop-blur-sm text-eve-muted hover:text-eve-text px-1.5 py-3 text-[0.6rem] cursor-pointer writing-mode-vertical"
                  style={{ writingMode: "vertical-rl" }}
                  onClick={toggleHeatmapSidebar}
                >
                  ◀ PANEL
                </button>
              )}
              {/* Floating sidebar overlay */}
              <div
                className={`absolute top-2 right-2 w-[280px] max-h-[calc(100%-16px)] overflow-y-auto z-10 grid gap-2 pointer-events-auto transition-all duration-200 ${
                  heatmapSidebarOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-[300px] pointer-events-none"
                }`}
              >
                <div className="border border-eve-panel-border bg-[rgba(7,10,15,0.92)] backdrop-blur-sm p-2.5 relative">
                  <button
                    className="absolute top-1.5 right-1.5 text-eve-muted hover:text-eve-text text-[0.6rem] cursor-pointer px-1 py-0.5 border border-eve-panel-border/40 hover:border-eve-panel-border bg-[rgba(7,10,15,0.8)]"
                    onClick={toggleHeatmapSidebar}
                  >
                    ▶
                  </button>
                  <h3 className="text-[0.7rem] uppercase tracking-wide text-eve-cold mb-1.5 pr-6">
                    {selectedNode ? selectedNode.label : "Selected System"}
                  </h3>
                  {selectedNode ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1 text-[0.65rem]">
                        <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.5)] p-1">
                          <span style={{ color: LABEL_COLORS.kills }}>⚔ Kills</span>
                          <strong className="block text-eve-text">{selectedNode.killCount}</strong>
                        </div>
                        <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.5)] p-1">
                          <span style={{ color: LABEL_COLORS.intel }}>📡 Intel</span>
                          <strong className="block text-eve-text">{selectedNode.intelCount}</strong>
                        </div>
                        <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.5)] p-1">
                          <span style={{ color: LABEL_COLORS.gates }}>🚪 Gates</span>
                          <strong className="block text-eve-text">{selectedNode.gateTraffic}</strong>
                        </div>
                        <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.5)] p-1">
                          <span style={{ color: LABEL_COLORS.market }}>💰 Market</span>
                          <strong className="block text-eve-text">{selectedNode.marketActivity}</strong>
                        </div>
                      </div>
                      <p className="text-[0.6rem] text-eve-muted">
                        Intensity: <strong className="text-eve-gold">{selectedNode.intensity}</strong>/100
                      </p>
                    </div>
                  ) : (
                    <p className="text-[0.65rem] text-eve-muted/70">Click a system node to inspect.</p>
                  )}
                </div>
                <div className="border border-eve-panel-border bg-[rgba(7,10,15,0.92)] backdrop-blur-sm p-2.5">
                  <h3 className="text-[0.7rem] uppercase tracking-wide text-eve-cold mb-1.5">Systems <span className="text-eve-muted font-normal">{nodes.length}</span></h3>
                  <div className="grid gap-1 max-h-48 overflow-y-auto">
                    {nodes
                      .slice()
                      .sort((a, b) => b.intensity - a.intensity)
                      .map((node) => (
                      <button
                        key={node.id}
                        className={`border p-1.5 text-left w-full cursor-pointer transition-colors text-[0.65rem] ${
                          selectedSystemId === node.id
                            ? "border-eve-gold/60 bg-[rgba(28,21,16,0.5)]"
                            : "border-eve-panel-border/30 bg-[rgba(8,11,16,0.6)] hover:border-eve-glow/40"
                        }`}
                        onClick={() => centerOnSystem(node.id)}
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-eve-text">{node.label}</strong>
                          <span className="text-eve-gold">{node.intensity}/100</span>
                        </div>
                        <div className="mt-0.5 flex gap-1.5 flex-wrap">
                          {node.killCount > 0 && <span style={{ color: LABEL_COLORS.kills }}>⚔ {node.killCount}</span>}
                          {node.intelCount > 0 && <span style={{ color: LABEL_COLORS.intel }}>📡 {node.intelCount}</span>}
                          {node.gateTraffic > 0 && <span style={{ color: LABEL_COLORS.gates }}>🚪 {node.gateTraffic}</span>}
                          {node.marketActivity > 0 && <span style={{ color: LABEL_COLORS.market }}>💰 {node.marketActivity}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
