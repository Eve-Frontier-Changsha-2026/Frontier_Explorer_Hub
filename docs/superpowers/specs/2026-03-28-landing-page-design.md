# Landing Page Design Spec

**Date**: 2026-03-28
**Purpose**: Hackathon demo landing page for Frontier Explorer Hub

## Overview

Cinematic scroll landing page at `/landing`, independent from the app shell (no sidebar). Matches the existing EVE-themed design system (eve-* colors, IBM Plex Mono, scanline/noise overlays). Serves as the demo entry point for judges and audience.

## Route

- **Path**: `/landing`
- **Layout**: Standalone — no `AppShell`, no sidebar. Own layout with `<html>` level styles inherited from root but no app chrome.
- **Navigation**: "Enter Hub →" CTA links to `/` (main app)

## Sections (top to bottom)

### 1. Hero (full viewport)
- Background: `bg-eve-space` + scanline + noise overlays (reuse existing CSS utilities)
- Top label: `SUI HACKATHON 2026 // CHANGSHA` — small, letter-spaced, `text-eve-cold`
- Title: `FRONTIER EXPLORER HUB` — large, bold, white
- Subtitle: "Real-time intelligence network for EVE Frontier, powered by SUI blockchain"
- CTA: bordered button `Enter Hub →` in `eve-gold`, links to `/`
- GitHub link: small text link to `https://github.com/Eve-Frontier-Changsha-2026/Frontier_Explorer_Hub`
- Scroll indicator: `▼ Scroll` at bottom, subtle bounce animation

### 2. Live Stats
- Fetch from `${API_BASE_URL}/api/world/status` on mount
- 5 metric cells in a row (responsive: wrap on mobile):
  - Active Pilots (`activePlayers`) — `eve-safe`
  - Kills / 24h (`recentKills`) — `eve-danger`
  - Defense Level (`defenseLevel`) — `eve-info`
  - Online Assemblies (`onlineAssemblies`) — `eve-gold`
  - Active Tribes (`activeTribes`) — `eve-cold`
- Fallback: show "—" if API unreachable
- Label: "LIVE WORLD STATUS" with pulsing dot indicator

### 3. Features (4 cards)
- Grid: 2×2 on desktop, 1-col on mobile
- Each card: icon area + title + 1-2 line description
- Cards:
  1. **Intel Network** — Submit & browse real-time intelligence reports, visualized on heatmap
  2. **Bounty System** — On-chain bounty creation with SUI escrow, proof submission & dispute resolution
  3. **Portal** — Bookmark and embed external EVE tools (dotlan, zkillboard) in-app via iframe
  4. **Dual-Source Data** — Union of EVE EYES + Utopia API for comprehensive world awareness

### 4. Architecture
- Simplified data flow diagram built with styled divs (no external lib)
- Layout:
  ```
  [EVE EYES API] ──┐
                    ├──→ [WorldAggregator] ──→ [Express Backend] ──→ [Next.js Frontend]
  [Utopia API]  ───┘                                ↕
                                            [SUI Blockchain]
                                          (Intel / Bounty / Escrow)
  ```
- Use `border`, `eve-panel-border` lines and arrow characters
- Each node: small panel with label

### 5. Tech Stack
- Horizontal wrap of badge pills
- Items: SUI Move, Next.js 15, Express, TypeScript, TanStack Query, Tailwind CSS, SQLite, EVE EYES API, Utopia API
- Style: `border border-eve-panel-border` pill, `text-eve-muted`, small font

### 6. Team (2 cards)
- Side by side on desktop, stacked on mobile
- **Ramon** — 系統規劃 / 後端 / 合約 / 系統整合
- **Tommy** — UI 設計與實作 / 遊戲分析 / 遊戲測試 / 功能再平衡
- Each card: name (large), role tags as pills

### 7. Roadmap (4 phases)
- Vertical timeline with left border line
- Phases from README:
  1. **Phase 1**: deck.gl 3D Starmap + advanced spatial analysis
  2. **Phase 2**: Plugin SDK + community marketplace
  3. **Phase 3**: Differential privacy (k-anonymity, spatial bucketing, time delay)
  4. **Phase 4**: Walrus decentralized storage + DAO governance
- Each phase: dot on timeline + title + 1-line description

## Technical Implementation

- **File**: `next-monorepo/app/src/app/landing/page.tsx`
- **Client component** for: Intersection Observer scroll animations, Live Stats fetch
- **No new dependencies** — use existing Tailwind config, CSS utilities
- **Scroll animation**: Intersection Observer with `opacity-0 translate-y-4` → `opacity-100 translate-y-0` transition on each section
- **API fetch**: simple `fetch()` in `useEffect`, no TanStack Query needed (one-shot, no caching needed for landing)
- **Responsive**: mobile-first, sections stack vertically

## Non-goals
- No auth/wallet connection on landing page
- No SSR for live stats (client-side fetch is fine)
- No i18n (English only for demo)
