# EVE EYES Frontend Integration — E4 Region Activity Panel + E5 Reporter Name Display

> Date: 2026-03-24
> Status: Approved
> Scope: Frontend only — backend APIs already exist

---

## Background

Backend (E1-E3) is complete:
- `GET /api/region/:regionId/summary` returns heatmap totals + EVE activity indices (defense/infra/traffic/active players)
- `GET /api/character/:address` returns resolved character info (name, address, cached 24h TTL)

This spec covers the frontend wiring: api-client functions, hooks, components, and integration into existing pages.

---

## E4: Region Activity Panel

### Data Source

Existing `GET /api/region/:regionId/summary` response (from `services/src/api/routes/region.ts`):

```ts
{
  regionId: number;
  heatmap: { totalReports: number; reporterCount: number };
  activity: {
    defenseIndex: number;   // turret calls / time window
    infraIndex: number;     // network_node calls / time window
    trafficIndex: number;   // gate calls / time window
    activePlayers: number;  // distinct senderAddress count
    windowStart: number;    // epoch ms
    windowEnd: number;      // epoch ms
    updatedAt: number;      // epoch ms
  } | null;                 // null if no activity data yet
}
```

### Types

Add to `types/index.ts`:

```ts
export interface RegionActivity {
  defenseIndex: number;
  infraIndex: number;
  trafficIndex: number;
  activePlayers: number;
  windowStart: number;
  windowEnd: number;
  updatedAt: number;
}

export interface RegionSummary {
  regionId: number;
  heatmap: { totalReports: number; reporterCount: number };
  activity: RegionActivity | null;
}
```

### API Client

Update `getRegionSummary` return type from current ad-hoc shape to `RegionSummary`.

### Hook: `useRegionActivity`

```ts
useRegionActivity(regionId: number | null) → {
  activity: RegionActivity | null;
  heatmap: { totalReports: number; reporterCount: number } | null;
  isLoading: boolean;
  isError: boolean;
  isStale: boolean; // activity.updatedAt > 10min ago
}
```

- `queryKey: ["region-activity", regionId]`
- `enabled: regionId != null`
- `refetchInterval: 5 * 60 * 1000` (match backend 5min polling)
- `staleTime: 2 * 60 * 1000`

### Component: `RegionActivityPanel`

Props:
```ts
interface RegionActivityPanelProps {
  regionId: number | null;
  compact?: boolean;  // true = single row for overview; false = full panel
}
```

**Full mode** (sidebar, when region selected):
- Panel title: "REGION ACTIVITY" with badge "R-{regionId}"
- 3 horizontal bar indicators for defense/infra/traffic (0-100 scale, normalized)
- Active players count
- "Updated X min ago" timestamp
- Stale indicator if > 10min
- Null state: "No activity data available"

**Compact mode** (map overview):
- Single row: 3 inline metric chips + active players
- No panel wrapper

Visual style: follows existing `Panel` + EVE theme (border-eve-panel-border, text-eve-muted, etc.)

### Integration

**Map page** (`app/map/page.tsx`):
1. **Sidebar**: Add `<RegionActivityPanel regionId={selectedRegionId} />` below "Selected Intel" panel
2. **Overview**: Add compact `<RegionActivityPanel regionId={globalRegionId} compact />` in map controls area or above map view

Region selection: extract `regionId` from selected cell state (already have `selected` state with `R-{regionId}` pattern).

---

## E5: Reporter Name Display

### Data Source

Existing `GET /api/character/:address` response (from `services/src/api/routes/character.ts`):

```ts
{
  address: string;
  name: string | null;      // null if unresolvable
  characterId: string | null;
  resolvedAt: number;
}
```

### Types

Add to `types/index.ts`:

```ts
export interface CharacterInfo {
  address: string;
  name: string | null;
  characterId: string | null;
  resolvedAt: number;
}
```

### API Client

New function:
```ts
export function getCharacter(address: string): Promise<CharacterInfo>
```

### Hook: `useCharacterName`

Single address:
```ts
useCharacterName(address: string | null) → {
  name: string | null;
  isLoading: boolean;
}
```

- `queryKey: ["character", address]`
- `enabled: !!address`
- `staleTime: 24 * 60 * 60 * 1000` (match backend 24h TTL)
- `refetchOnWindowFocus: false`

Batch version:
```ts
useCharacterNames(addresses: string[]) → Map<string, { name: string | null; isLoading: boolean }>
```

- Uses `useQueries` to parallel-fetch
- Deduplicates addresses
- Same cache config

### Component: `CharacterName`

```ts
interface CharacterNameProps {
  address: string;
  truncateLength?: number;  // default 6 (0x1234...abcd)
  showAddress?: boolean;    // show address as tooltip/subtitle, default false
  className?: string;
}
```

Rendering:
- Loading: shimmer placeholder (same width as truncated address)
- Resolved: character name in `text-eve-gold`, with truncated address on hover (title attr)
- Unresolved (name is null): truncated address in `text-eve-muted` (same as current behavior)

### Integration Points

1. **Map page Live Feed** (`app/map/page.tsx`): Replace raw `item.id` or reporter address display with `<CharacterName address={item.reporter} />`

2. **Bounty detail — ProofTimeline**: Each timeline event's `hunter` and `actor` fields → `<CharacterName>`

3. **Bounty detail — ClaimTicketList**: Each ticket's `hunter` field → `<CharacterName>`

---

## Files Changed

| File | Change |
|------|--------|
| `types/index.ts` | Add `RegionActivity`, `RegionSummary`, `CharacterInfo` |
| `lib/api-client.ts` | Update `getRegionSummary` return type, add `getCharacter` |
| `hooks/use-region-activity.ts` | New hook |
| `hooks/use-character.ts` | New hooks (`useCharacterName`, `useCharacterNames`) |
| `components/RegionActivityPanel.tsx` | New component |
| `components/CharacterName.tsx` | New component |
| `app/map/page.tsx` | Integrate both components |
| `app/bounties/[id]/page.tsx` | Integrate `CharacterName` (or its sub-components) |

---

## Out of Scope

- Global region aggregation (sum all regions) — would need new backend endpoint
- Character name in market/store pages — future expansion
- Character avatar/portrait display — no data source yet
- Real-time WebSocket updates — current polling is sufficient for demo
