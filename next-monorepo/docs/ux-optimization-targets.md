# Frontier Explorer Hub - UX Optimization Targets

## Performance Budgets

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse on testnet |
| Time to Interactive (TTI) | < 3s | Lighthouse |
| Heatmap first render | < 500ms after data arrives | Performance.mark |
| Map zoom transition | < 200ms | 60fps target |
| Intel unlock confirmation | < 2s (tx finality) | Event listener |
| Page-to-page navigation | < 300ms | Next.js RSC streaming |

## Interaction Patterns

### 1. Optimistic UI for Transactions
- Show immediate optimistic state for on-chain mutations.
- Button -> spinner -> "Confirming..." -> success/error toast.
- Use `useUIStore.pendingTx` for global tx status.
- On failure: revert optimistic state + show retry.

### 2. Map Performance
- Use deck.gl for WebGL rendering; avoid per-frame React rerender.
- Keep controls in separate tree to avoid viewport jitter.
- Use Zustand for shared state, TanStack Query for stale-while-revalidate.

### 3. Tier-Gated UI Affordances
- Free users see upgrade prompts instead of hard errors.
- Premium-only data fields should use skeletons, not empty gaps.

### 4. Progressive Disclosure
- Map is primary surface.
- Panels default to collapsed where possible.
- Bounty/Subscribe/Store remain page-level routes.

### 5. Offline/Error Resilience
- Keep cached data visible during transient failures.
- Wallet disconnect should not clear map state.

### 6. Loading States
- Prefer skeleton loaders over spinners for data cards.
- Map keeps outline while heatmap refreshes.

### 7. Accessibility & Input
- Keyboard navigable controls.
- Scroll, button, keyboard zoom.
- Responsive mobile layout.

## Component Interface Contracts
- `useHeatmap` + `useMapViewport` for map canvas wiring.
- `useIntelDetail` + `useUnlockIntel` for intel panel.
- `useMapStore` for controls/filter state.
- `useSubscription` for subscribe flow.
- `useBounties` for bounty board.
- `PluginBridge` for plugin host iframe messaging.
