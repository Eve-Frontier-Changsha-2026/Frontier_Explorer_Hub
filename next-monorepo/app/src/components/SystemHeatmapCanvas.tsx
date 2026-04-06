"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSystemHeatmap } from "@/hooks/use-system-heatmap";
import { useMapStore } from "@/stores/map-store";
import { SCENE_SIZE, type SceneNode } from "@/lib/system-heatmap-scene";

// ── Rendering helpers ─────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function particleCount(intensity: number) {
  if (intensity >= 85) return 110;
  if (intensity >= 70) return 70;
  if (intensity >= 55) return 42;
  if (intensity >= 35) return 20;
  if (intensity > 0) return 8;
  return 0;
}

function spreadRadius(intensity: number) {
  if (intensity >= 85) return 42;
  if (intensity >= 70) return 54;
  if (intensity >= 55) return 62;
  if (intensity >= 35) return 70;
  return 84;
}

function alphaForIntensity(intensity: number) {
  return clamp(0.2 + intensity / 115, 0.22, 0.96);
}

// ── Data label colors ─────────────────────────────────────────────

const LABEL_COLORS = {
  kills: "#f87171",
  intel: "#22d3ee",
  gates: "#a78bfa",
  market: "#fbbf24",
} as const;

// ── Component ─────────────────────────────────────────────────────

export function SystemHeatmapCanvas() {
  const { nodes, links, stars, isLoading } = useSystemHeatmap();
  const centerOnSystem = useMapStore((s) => s.centerOnSystem);
  const centerOnSystemId = useMapStore((s) => s.centerOnSystemId);
  const clearCenterOn = useMapStore((s) => s.clearCenterOn);
  const selectedSystemId = useMapStore((s) => s.selectedSystemId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const didInit = useRef(false);

  const minZoom = useMemo(() => {
    if (!viewportSize.width) return 0.55;
    return Math.max(0.55, Math.min(viewportSize.width / SCENE_SIZE.width, viewportSize.height / SCENE_SIZE.height));
  }, [viewportSize]);

  // ── Resize observer ─────────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const size = { width: r.width, height: r.height };
      setViewportSize(size);
      if (!didInit.current) {
        didInit.current = true;
        const z = Math.max(0.55, Math.min(size.width / SCENE_SIZE.width, size.height / SCENE_SIZE.height));
        setZoom(z);
        setOffset({ x: (size.width - SCENE_SIZE.width * z) / 2, y: (size.height - SCENE_SIZE.height * z) / 2 });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Center on system when requested ────────────────────────────
  useEffect(() => {
    if (!centerOnSystemId || !viewportSize.width) return;
    const node = nodes.find((n) => n.id === centerOnSystemId);
    if (!node || node.x == null || node.y == null) return;
    const targetZoom = Math.max(minZoom, 1.2);
    setZoom(targetZoom);
    setOffset({
      x: viewportSize.width / 2 - (node.x ?? 0) * targetZoom,
      y: viewportSize.height / 2 - (node.y ?? 0) * targetZoom,
    });
    clearCenterOn();
  }, [centerOnSystemId, nodes, viewportSize, minZoom, clearCenterOn]);

  // ── Canvas rendering ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SCENE_SIZE.width * dpr;
    canvas.height = SCENE_SIZE.height * dpr;
    canvas.style.width = `${SCENE_SIZE.width}px`;
    canvas.style.height = `${SCENE_SIZE.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SCENE_SIZE.width, SCENE_SIZE.height);
    ctx.globalCompositeOperation = "lighter";

    for (const node of nodes) {
      const count = particleCount(node.intensity);
      const spread = spreadRadius(node.intensity);
      const alpha = alphaForIntensity(node.intensity);
      const rng = seededRandom(hashSeed(node.id));
      const isActive = selectedSystemId === node.id || hoveredId === node.id;
      const scale = isActive ? 1.18 : 1;

      for (let p = 0; p < count; p++) {
        const angle = rng() * Math.PI * 2;
        const r = Math.pow(rng(), 1.35) * spread * scale;
        const px = (node.x ?? 0) + Math.cos(angle) * r;
        const py = (node.y ?? 0) + Math.sin(angle) * r;
        const size = 0.8 + rng() * 1.8 + (isActive ? 0.35 : 0);
        const grad = ctx.createRadialGradient(px, py, 0, px, py, size * 4.5);
        grad.addColorStop(0, `rgba(255, 247, 237, ${alpha})`);
        grad.addColorStop(0.28, `rgba(249, 115, 22, ${alpha * 0.96})`);
        grad.addColorStop(0.62, `rgba(194, 65, 12, ${alpha * 0.42})`);
        grad.addColorStop(1, "rgba(194, 65, 12, 0)");
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(px, py, size * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center dot
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.fillStyle = isActive ? "rgba(255, 247, 237, 0.95)" : "rgba(255, 235, 219, 0.86)";
      ctx.arc(node.x ?? 0, node.y ?? 0, isActive ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
    }
    ctx.globalCompositeOperation = "source-over";
  }, [nodes, selectedSystemId, hoveredId]);

  // ── Interaction handlers ────────────────────────────────────────
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const wx = (px - offset.x) / zoom;
    const wy = (py - offset.y) / zoom;
    const nz = clamp(zoom + (e.deltaY < 0 ? 0.12 : -0.12), minZoom, 2.4);
    setZoom(nz);
    setOffset({ x: px - wx * nz, y: py - wy * nz });
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    dragState.current = { ox: offset.x, oy: offset.y, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.sx;
    const dy = e.clientY - dragState.current.sy;
    if (!dragState.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) dragState.current.moved = true;
    setOffset({ x: dragState.current.ox + dx, y: dragState.current.oy + dy });
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (dragState.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      suppressClickRef.current = dragState.current.moved;
      if (suppressClickRef.current) setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragState.current = null;
  }

  if (isLoading) {
    return <p className="text-[0.73rem] text-eve-muted p-4 animate-pulse">Loading system heatmap...</p>;
  }

  if (nodes.length === 0) {
    return <p className="text-[0.73rem] text-eve-muted p-4">No system data available. Submit intel or wait for killmail indexing.</p>;
  }

  const TEN_MIN = 10 * 60 * 1000;

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        style={{
          width: SCENE_SIZE.width,
          height: SCENE_SIZE.height,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "relative",
        }}
      >
        {/* Background stars */}
        <svg className="absolute inset-0" width={SCENE_SIZE.width} height={SCENE_SIZE.height} aria-hidden="true">
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.size} fill={`rgba(255, 238, 219, ${s.alpha})`} />
          ))}
        </svg>

        {/* Route lines */}
        <svg className="absolute inset-0" width={SCENE_SIZE.width} height={SCENE_SIZE.height} aria-hidden="true" style={{ opacity: 0.2 }}>
          {links.map((l, i) => {
            const src = nodes.find((n) => n.id === (typeof l.source === "string" ? l.source : (l.source as SceneNode).id));
            const tgt = nodes.find((n) => n.id === (typeof l.target === "string" ? l.target : (l.target as SceneNode).id));
            if (!src || !tgt) return null;
            return <line key={i} x1={src.x ?? 0} y1={src.y ?? 0} x2={tgt.x ?? 0} y2={tgt.y ?? 0} stroke="#f97316" strokeWidth={1} />;
          })}
        </svg>

        {/* Canvas particle layer */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* Interactive node overlays + data labels */}
        {nodes.map((node) => {
          const isActive = selectedSystemId === node.id || hoveredId === node.id;
          const isRecent = Date.now() - node.latestEventAt < TEN_MIN;
          const showLabels = isActive || node.intensity > 0;

          return (
            <button
              key={node.id}
              type="button"
              className="absolute -translate-x-1/2 -translate-y-1/2 text-left group"
              style={{ left: node.x ?? 0, top: node.y ?? 0 }}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => {
                if (suppressClickRef.current) return;
                centerOnSystem(node.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Pulse ring for recent activity */}
              {isRecent && (
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-400/30 animate-ping pointer-events-none"
                  style={{ width: 28, height: 28 }}
                />
              )}

              {/* Hit area */}
              <span className="block w-8 h-8" />

              {/* System name */}
              <span
                className="absolute top-[-18px] left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap pointer-events-none"
                style={{ color: isActive ? "#fff7ed" : "rgba(255,237,213,0.7)" }}
              >
                {node.label}
              </span>

              {/* Data labels */}
              {showLabels && (
                <span className="absolute top-[18px] left-[14px] text-[8px] whitespace-nowrap pointer-events-none grid gap-[1px]">
                  {node.killCount > 0 && <span style={{ color: LABEL_COLORS.kills, opacity: 0.85 }}>⚔ {node.killCount}</span>}
                  {node.intelCount > 0 && <span style={{ color: LABEL_COLORS.intel, opacity: 0.75 }}>📡 {node.intelCount}</span>}
                  {node.gateTraffic > 0 && <span style={{ color: LABEL_COLORS.gates, opacity: 0.6 }}>🚪 {node.gateTraffic}</span>}
                  {node.marketActivity > 0 && <span style={{ color: LABEL_COLORS.market, opacity: 0.6 }}>💰 {node.marketActivity}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
