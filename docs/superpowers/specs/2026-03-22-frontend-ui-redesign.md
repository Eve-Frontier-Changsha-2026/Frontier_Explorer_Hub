# Frontend UI Redesign — EVE Frontier Style

**Date:** 2026-03-22
**Status:** Approved
**Dependency:** Plan A (contracts + services) completed, Plan B data layer completed

## Goal

Rebuild the visual layer of the Frontier Explorer Hub frontend with EVE Frontier game aesthetics, while preserving the existing data layer (hooks, stores, API client, auth, PTB builders) untouched. Full backend integration by removing mock data and connecting to real API/chain.

## Decisions

| Decision | Choice |
|---|---|
| Visual style | Hybrid — Dashboard/tables: clean dark UI; Map: immersive deep-space; Global: subtle HUD animations |
| Navigation | Left sidebar (icon + label, collapsible) |
| Animation level | Medium — scanline overlay, data-decrypt text, glow pulse, panel slide-in. No heavy particles/glitch |
| CSS architecture | Tailwind CSS (migrate from globals.css) |
| Star Map | Dual-mode — ef-map iframe tab + deck.gl heatmap tab with toggle |
| Backend integration | All 6 pages, full integration (no pages left on mock) |
| Architecture approach | Foundation Layer + Parallel Pages |

## Prerequisites

Before Phase 1, install Tailwind and configure the build pipeline:

```bash
cd app && npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

Create `postcss.config.js`:
```js
module.exports = { plugins: { '@tailwindcss/postcss': {} } };
```

Update `layout.tsx`: replace `import "./globals.css"` with Tailwind entry CSS import, wrap `{children}` with `<AppShell>`.

## Architecture

### Phase 1: Foundation

Build shared infrastructure before any page work begins.

1. **Tailwind CSS config** — EVE Frontier design tokens (colors, fonts, animations)
2. **AppShell component** — sidebar + topbar + scrollable content area
3. **Sidebar** — 6 nav items + wallet connect, collapsible (200px / 56px)
4. **Animation utilities** — Tailwind plugin with custom animation classes
5. **Shared UI components** — Panel, MetricChip, RiskBadge, StatusChip

### Phase 2: Page Rewrites (parallelizable)

Each page is independent — can be built simultaneously using subagents.

### Phase 3: Backend Integration (concurrent with Phase 2)

Remove mock-data imports, connect hooks to real API/chain, wire PTB builders to signAndExecuteTransaction.

## Design Tokens

### Colors

```
eve-bg:           #020304              — deep space background
eve-panel:        rgba(8, 11, 16, 0.9) — panel background
eve-panel-border: rgba(171, 190, 217, 0.22)
eve-text:         #e7edf8              — primary text
eve-muted:        rgba(231, 237, 248, 0.62) — secondary text
eve-cold:         #9db6d8              — headings, brand accent (cold blue)
eve-danger:       #db7768              — CRITICAL risk
eve-warn:         #d3b075              — HIGH risk / warnings
eve-safe:         #9fd1b2              — LOW risk
eve-info:         #bdd4f1              — MEDIUM risk
eve-gold:         #e4b480              — Premium accent
eve-glow:         rgba(122, 176, 227, 0.68) — selection glow
```

### Typography

- Primary: `IBM Plex Mono` (monospace stack fallback)
- No additional fonts

### Animation System

| Utility | Effect | Usage |
|---|---|---|
| `animate-scanline` | Horizontal scan line top→bottom loop | Global overlay, very low opacity |
| `animate-glow-pulse` | Border glow breathing | Premium CTA, active panels |
| `animate-data-decrypt` | Random chars → decoded text reveal | Data load completion |
| `animate-slide-in` | Slide from left/bottom + fade | Panel entrance |
| `animate-pulse-dot` | Small dot pulsing | LIVE indicator, sidebar active |
| `animate-flicker` | Subtle flicker | Warning text, risk badges |

### Background

- Body: radial-gradient deep space (preserve existing)
- Noise texture overlay (preserve existing `.bg-noise` concept)
- CSS-only stars (no canvas)

## AppShell + Sidebar

### Layout

```
┌─────────────────────────────────────────────┐
│ Topbar (fixed)                              │
│ [LIVE] EVE Frontier open-source frontier... │
├────────┬────────────────────────────────────┤
│        │ Header                             │
│  Side  │ [Brand Tag] TITLE / metrics        │
│  bar   ├────────────────────────────────────┤
│        │                                    │
│  icon  │ Page Content (scrollable)          │
│  +     │                                    │
│  label │                                    │
│        │                                    │
│  ----  │                                    │
│  wallet│                                    │
│  btn   │                                    │
└────────┴────────────────────────────────────┘
```

### Sidebar Spec

- Width: expanded 200px / collapsed 56px (icon-only)
- Collapse: manual toggle button at sidebar bottom
- State: `ui-store.ts` → add `sidebarCollapsed: boolean` + `toggleSidebar: () => void`
- Icons: inline SVG geometric shapes (no icon library)
  - Dashboard = 4-grid squares
  - Map = crosshair
  - Submit = up arrow
  - Bounties = target/bullseye
  - Membership = shield
  - Store = 3x3 grid

### Wallet Integration

- Position: sidebar bottom
- Disconnected: `[Connect Wallet]` button
- Connected: truncated address `0x1a2b...3c4d` + tier badge (Free/Premium)

## Page Designs

### Dashboard (`/`)

- Layout: main + aside two-column (unchanged)
- Data source mapping:
  - `headlines` / `timelineEvents` → **keep as static content** (no backend endpoint for editorial data; update text to match project theme)
  - `intelFeed` → `useHeatmap()` cells converted to feed items (id, system, risk derived from severity)
  - Activity stats → computed from `getHeatmap(0)` aggregated cell counts
  - Region summary widget → `getRegionSummary(regionId)` with default regionId=0; user can click region chips to switch
- New hook: `useDashboard()` — wraps `useHeatmap()` + `useQuery(['regionSummary', regionId], () => getRegionSummary(regionId))`
- Animations: panel `animate-slide-in`, breaking news `animate-flicker`, LIVE chip `animate-pulse-dot`

### Map (`/map`)

- Dual-mode toggle tabs: "Conflict Map (ef-map)" / "Intel Heatmap (deck.gl)"
- ef-map tab: preserve existing iframe embed
- deck.gl tab: `HeatmapLayer` rendering `useHeatmap()` cells (sectorX/Y → lng/lat mapping), dark background + CSS stars
- Right panel: selected intel detail + live feed via `useIntel()`
- Animations: tab switch fade, heatmap cell breathing

### Submit (`/submit`)

- Form fields aligned to `SubmitIntelParams` in `lib/ptb/intel.ts`:
  - `location: GridCell` — regionId, sectorX, sectorY, sectorZ, zoomLevel (structured group)
  - `rawLocationHash: number[]` — auto-computed SHA-256 of raw coordinates (hidden from user, calculated on submit)
  - `intelType: number` — dropdown (Resource/Threat/Wreckage/Population)
  - `severity: number` — slider 0-10
  - `expiryMs: number` — duration picker (1h/6h/24h/7d → computed to epoch ms)
  - `visibility: number` — dropdown (0=public, 1=subscribers-only)
  - `depositMist: number` — input with minimum `MIN_SUBMIT_DEPOSIT_MIST` (0.01 SUI)
- Submit flow: fill → preview → `signAndExecuteTransaction` via `buildSubmitIntel`
- Draft queue → tx history (recent submissions from chain/indexer)
- Animations: submit success → `animate-data-decrypt` showing tx digest

### Bounties (`/bounties`)

- Create: form → `buildCreateBounty` → `signAndExecuteTransaction`
- List: `useBounties()` → real on-chain data, remove local mock
- Claim: per-bounty "Submit for Bounty" button → `buildSubmitForBounty` PTB
- Animations: card entrance stagger `animate-slide-in`

### Subscribe (`/subscribe`)

- Status: `useSubscription()` → real tier/expiry display
- Upgrade: Premium button → `buildSubscribe` → `signAndExecuteTransaction`
- Coverage zones + capability matrix: keep as static product spec
- Animations: Premium card `animate-glow-pulse`

### Store (`/store`)

- Plugin catalog: keep mock data (plugin registry not yet deployed to testnet)
- Loadout slots: preserve existing equip/clear logic
- Future: `usePlugins()` hook ready, connect when registry deployed
- Animations: plugin card hover glow, slot equip transition

## Backend Integration Strategy

### Data Flow (no changes needed)

```
Page Component → Hook → API Client → Backend Data API (Plan A)
Page Component → Hook → PTB Builder → signAndExecuteTransaction → Chain
```

### Required Actions

1. `.env.local` — fill real object IDs after testnet deployment
2. Pages remove `mock-data.ts` imports → use hook return values
3. New `useDashboard()` hook — combines heatmap + region summary for dashboard display
4. Submit/Bounties/Subscribe pages — wire `signAndExecuteTransaction` to PTB builders
5. Error handling: PTB failure → toast (ui-store), API failure → retry prompt, wallet disconnected → disabled buttons + tooltip

### New Files

| File | Purpose |
|---|---|
| `hooks/use-dashboard.ts` | Combine heatmap + region summary → dashboard data |
| `components/AppShell.tsx` | Sidebar + topbar + content layout |
| `components/Sidebar.tsx` | Navigation + wallet connect |
| `components/ui/*.tsx` | Panel, RiskBadge, MetricChip, StatusChip shared components |
| `components/ToastContainer.tsx` | Render toast notifications from `ui-store` toast queue |
| `tailwind.config.ts` | EVE Frontier theme + animation plugin |

### Files Preserved (no changes)

- `lib/api-client.ts`
- `lib/auth.ts`
- `lib/constants.ts`
- `lib/ptb/*.ts` (5 PTB builders)
- `hooks/use-auth.ts`, `use-heatmap.ts`, `use-intel.ts`, `use-subscription.ts`, `use-bounties.ts`, `use-plugins.ts`, `use-map-viewport.ts`
- `stores/map-store.ts`, `stores/ui-store.ts` (only add `sidebarCollapsed`)
- `types/index.ts`
- `lib/plugin-bridge/`
- `packages/plugin-sdk/`

### Files Removed

- `app/src/app/globals.css` — replaced by Tailwind base CSS + `tailwind.config.ts` theme
- `app/src/app/shell-frame.tsx` — replaced by `components/AppShell.tsx`
- `app/src/lib/risk-class.ts` — inline into RiskBadge component
- `app/src/app/layout.tsx` — update import from `globals.css` to Tailwind entry CSS, wrap children with `<AppShell>`
