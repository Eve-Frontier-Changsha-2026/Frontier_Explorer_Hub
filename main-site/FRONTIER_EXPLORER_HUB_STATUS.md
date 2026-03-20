# Frontier Explorer Hub: Scope vs Current Mock

## 1. What the concept documents describe

Based on `markdowns/Frontier_Explorer_Hub/README.md` and related concept docs:

- A unified intel platform for EVE Frontier:
  - resource intel
  - threat radar
  - wreck/combat records
  - strategic route planning
- On-chain intel objects with:
  - timestamp
  - location
  - intel type
  - visibility scope (public/tribe/alliance/private)
- Permissioned intel trading via smart contracts.
- Tactical replay and war-memory archive (killmails, fleet losses, outcomes).
- A platform vision beyond one app:
  - third-party tools
  - SDK-style extension model
  - dApp store direction

## 2. What is implemented in the current frontend mock

Implemented in `builder-scaffold/dapps/src/App.tsx` + `main.css`:

- Tactical operations shell UI (English only).
- Survival-grade visual language:
  - dark, sparse, industrial, military UI tone
  - compact information density
  - constrained warning color usage
- Interactive map:
  - clickable sectors (A/B/C)
  - per-sector coordinates and threat level
  - route lines and grid labels
  - map-focused full-screen mode
  - optional EF-map reference embed in focused view
- Radial command interaction:
  - `SCAN`, `TRACE`, `WARP`, `LOCK`, `TAG`, `ALERT`
  - command execution writes to log stream
- Channel filtering:
  - `Alliance Ops`, `Wreck Recovery`, `Outer Rim Logistics`
- Event feed and command actions:
  - acknowledge alert
  - open war table action
  - live log updates
- Panel focus mode:
  - each major panel can expand to full-screen
  - close via button or `Esc`
- Compact/expanded layout toggle.

## 3. What is still mock-only (not connected yet)

- No live GraphQL/world data binding.
- No real intel object CRUD flow.
- No real permission model or on-chain intel trade execution.
- No live killmail replay pipeline.
- No real dApp plugin/runtime loading system.

## 4. Recommended next implementation milestones

1. Wire map sectors and feed entries to real GraphQL queries from dapp-kit.
2. Replace static channel/feed state with query-backed stores + polling/subscriptions.
3. Implement intel object detail drawer and visibility controls.
4. Add real route risk scoring and route recommendation panel.
5. Add replay timeline view for historical battles.
6. Introduce widget layout persistence (drag/reorder/resize).
