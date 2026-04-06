# System-Based Event Heatmap — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Overview

以星系名稱為節點，聚合 4 種鏈上/API 事件（killmails、intel reports、gate traffic、market activity），用 Canvas2D 粒子光暈渲染成互動式星圖。佈局用 d3-force 力導向圖自動排列。

## Data Aggregation

### New Table: `heatmap_systems`

```sql
CREATE TABLE IF NOT EXISTS heatmap_systems (
  system_id    TEXT PRIMARY KEY,   -- solarSystemId or region_id
  system_name  TEXT NOT NULL,      -- e.g. "ONT-MT7"
  kill_count   INTEGER NOT NULL DEFAULT 0,
  intel_count  INTEGER NOT NULL DEFAULT 0,
  gate_traffic INTEGER NOT NULL DEFAULT 0,
  market_activity INTEGER NOT NULL DEFAULT 0,
  intensity    REAL NOT NULL DEFAULT 0,   -- 0~100
  latest_event_at INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_heatmap_systems_intensity ON heatmap_systems(intensity);
```

### Data Sources

| Source | Table/API | Field mapped to system_id | Weight |
|--------|-----------|--------------------------|--------|
| Utopia killmails | `utopia_killmails` | `solar_system_id` | +20/kill |
| Intel reports | `intel_reports` | `region_id` (= solarSystemId by convention) | +15/report, severity multiplier |
| Gate traffic | EVE Eyes move-calls (`gate` module) | Derived from tx → object lookup | +5/call |
| Market activity | `intel_market` on-chain events | Linked to intel's region_id | +3/listing or bounty |

### Intensity Formula

```
intensity = min(100, kill_count × 20 + intel_count × 15 + gate_traffic × 5 + market_activity × 3)
```

### Aggregator: `SystemHeatmapAggregator`

- New class in `services/src/aggregator/system-heatmap.ts`
- Runs on same scheduler interval as existing `AggregationScheduler` (default 5 min)
- Queries each source table, groups by system_id, computes intensity
- Upserts into `heatmap_systems`
- Does NOT replace existing `heatmap_cache` pipeline (kept for future spatial heatmap)

## System Node Management

### Seed Systems

13 systems from frontier-trade-routes with known solarSystemId + label:

```typescript
const SEED_SYSTEMS: SystemSeed[] = [
  { id: "30001719", name: "ONT-MT7", initX: 236, initY: 840 },
  { id: "30004452", name: "IN3-K3D", initX: 372, initY: 472 },
  { id: "30004448", name: "EH1-FQC", initX: 448, initY: 420 },
  { id: "30004453", name: "ULV-77D", initX: 548, initY: 454 },
  { id: "30004449", name: "U1S-HBD", initX: 594, initY: 372 },
  { id: "30004451", name: "E27-HSD", initX: 650, initY: 304 },
  { id: "30004455", name: "E5V-0BD", initX: 680, initY: 452 },
  { id: "30004454", name: "O3V-49D", initX: 756, initY: 484 },
  { id: "30004450", name: "OBQ-6JD", initX: 818, initY: 388 },
  { id: "30000007", name: "UR7-5FN", initX: 1016, initY: 286 },
  { id: "30000006", name: "OFC-3FN", initX: 1124, initY: 248 },
  { id: "30000005", name: "I9T-0FN", initX: 1266, initY: 214 },
  { id: "30000004", name: "O3H-1FN", initX: 1384, initY: 178 },
];
```

### Dynamic Discovery

- New solarSystemId from killmails or region_id from intel → auto-added to `heatmap_systems`
- System name: use known name if available, otherwise `SYS-{id.slice(-6)}` placeholder
- d3-force auto-positions new nodes relative to existing graph

### Layout: d3-force

- `d3-force` with `forceLink`, `forceManyBody`, `forceCenter`
- Seed systems get `fx`/`fy` as initial warm-start positions (released after stabilization)
- Systems with gate traffic between them → link force (attracts connected systems)
- Systems without links → nearest-neighbor secondary links (distance < 340px, max 2 per node)
- Layout computed once on data load, cached until data changes

## Rendering

### Canvas2D Particle Glow (ported from frontier-trade-routes)

**File:** `next-monorepo/app/src/components/SystemHeatmapCanvas.tsx`

- Seeded random per system (deterministic particle positions)
- Intensity → particle count (8~110), spread (84~42px), alpha (0.22~0.96)
- Radial gradient: warm orange `#fff7ed` → `#f97316` → `#c2410c` → transparent
- `globalCompositeOperation: "lighter"` for additive blending

### Data Labels (multi-color by event type)

| Event Type | Color | Icon |
|-----------|-------|------|
| Kills | `#f87171` (red) | ⚔ |
| Intel | `#22d3ee` (cyan) | 📡 |
| Gates | `#a78bfa` (purple) | 🚪 |
| Market | `#fbbf24` (yellow) | 💰 |

- Labels rendered as HTML overlay (not canvas) for crisp text
- Only shown when intensity > 0 or on hover
- Pulse ring animation (CSS) on nodes with recent activity (< 10 min)

### Background

- 620 seeded random stars (SVG circles)
- Route connection lines between linked systems (SVG, `opacity: 0.15~0.25`)

## Interaction

### Pan & Zoom

- Pointer events for drag (same pattern as frontier-trade-routes)
- Wheel for zoom (0.55x ~ 2.4x range)
- Clamped to content bounds with insets

### Click System Node

- Updates existing `RegionActivityPanel` with selected system's data
- Panel shows: kill breakdown, intel reports, gate traffic, market listings
- Uses existing `useRegionActivity` hook, extended with system heatmap data

### Hover

- Highlight: scale 1.18x, brightness boost
- Show data labels if hidden at default zoom

## Frontend Integration

### Modified Files

- `next-monorepo/app/src/app/map/page.tsx` — replace placeholder grid with `SystemHeatmapCanvas`
- `next-monorepo/app/src/hooks/use-heatmap.ts` — fetch from new `/api/heatmap/systems` endpoint
- `next-monorepo/app/src/components/RegionActivityPanel.tsx` — extend to accept system heatmap data
- `next-monorepo/app/src/stores/map-store.ts` — add `selectedSystemId` state

### New Files

- `next-monorepo/app/src/components/SystemHeatmapCanvas.tsx` — main canvas + overlay component
- `next-monorepo/app/src/lib/system-heatmap-scene.ts` — seed systems, d3-force layout, link generation
- `services/src/aggregator/system-heatmap.ts` — backend aggregator
- `services/src/api/routes/system-heatmap.ts` — REST endpoint

### New API Endpoint

```
GET /api/heatmap/systems
Response: { systems: SystemHeatmapNode[], links: { from: string, to: string }[], generatedAt: string }
```

### Dependencies

- **Add:** `d3-force` (layout only, ~30KB)
- **Remove:** `@deck.gl/core`, `@deck.gl/layers` (no longer needed)

## What Stays Unchanged

- `heatmap_cache` table + K-anonymity pipeline (kept for future spatial heatmap)
- `AggregationScheduler` class (system heatmap aggregator hooks into same scheduler)
- `RegionActivityPanel` interface (extended, not replaced)
- Backend API structure (new endpoint, no breaking changes)
- Existing map page "Conflict Map" tab (external embed, untouched)
