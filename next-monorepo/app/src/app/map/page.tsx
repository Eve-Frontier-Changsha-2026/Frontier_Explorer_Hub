"use client";

import { useState } from "react";
import { useHeatmap } from "@/hooks/use-heatmap";
import { useMapViewport } from "@/hooks/use-map-viewport";
import { useMapStore } from "@/stores/map-store";
import { intelFeed } from "@/lib/mock-data";
import { riskClass } from "@/lib/risk-class";
import { ShellFrame } from "../shell-frame";

export default function MapPage() {
  const { cells, effectiveZoom, isZoomLimited, isLoading } = useHeatmap();
  const { onViewportChange } = useMapViewport();
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <ShellFrame
      title="TACTICAL CONFLICT MAP"
      subtitle="Map control surface with tier-aware zoom behavior and live intel stream."
    >
      <div className="page-grid">
        <section className="column">
          <article className="panel">
            <div className="panel-title">
              <h2>Map Controls</h2>
              <span>Zoom {effectiveZoom}</span>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setZoomLevel(zoomLevel - 1)}>
                Zoom Out
              </button>
              <button className="btn" onClick={() => setZoomLevel(zoomLevel + 1)}>
                Zoom In
              </button>
              <button
                className="btn"
                onClick={() => onViewportChange({ longitude: 0, latitude: 0, zoom: 7, pitch: 30, bearing: 12 })}
              >
                Simulate Camera
              </button>
            </div>
            <p className="hint">Loading: {String(isLoading)} | Cells available: {cells.length}</p>
            {isZoomLimited && <p className="hint">Current account tier limits deeper zoom.</p>}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Conflict Map</h2>
              <span>External Embed</span>
            </div>
            <div className="efmap-wrap">
              <iframe
                className="efmap-frame"
                src="https://ef-map.com/embed?embed=1"
                title="EVE Frontier map"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </article>
        </section>

        <aside className="side">
          <article className="panel">
            <div className="panel-title">
              <h2>Selected Intel</h2>
              <span>{selected ?? "none"}</span>
            </div>
            <p className="hint">Click any feed item to mark a target for panel focus.</p>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Live Feed</h2>
              <span>{intelFeed.length}</span>
            </div>
            <div className="list scroll">
              {intelFeed.map((item) => (
                <button key={item.id} className="feed-item" onClick={() => setSelected(item.id)}>
                  <div className="panel-title">
                    <strong>{item.id}</strong>
                    <span className={riskClass(item.risk)}>{item.risk}</span>
                  </div>
                  <p>{item.note}</p>
                  <div className="meta-row">
                    <span>SYS-{item.system}</span>
                    <span>{item.ts} UTC</span>
                  </div>
                </button>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </ShellFrame>
  );
}
