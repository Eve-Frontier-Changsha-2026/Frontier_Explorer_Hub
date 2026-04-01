# Utopia + EVE EYES Dual-Source Integration Design

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Backend data aggregation + Frontend dashboard integration

## Goal

Integrate Utopia (utopia.evedataco.re) and EVE EYES (eve-eyes.d0v.xyz) as dual data sources for the Frontier Explorer Hub dashboard. Replace all mock data with real-world events. Display a unified world status using a set-union approach — both sources contribute to a single consolidated view with per-source freshness tracking.

## Data Sources

### EVE EYES API (existing, partially integrated)

| Endpoint | Method | Data |
|----------|--------|------|
| `/api/indexer/move-calls` | GET | On-chain move calls (turret, network_node, gate) |

Already integrated via `EveEyesClient` + `ActivityTracker`. Produces:
- `defenseIndex` — turret calls/hr
- `infraIndex` — network_node calls/hr
- `trafficIndex` — gate calls/hr
- `activePlayers` — distinct senders across modules

### Utopia API (new)

| Endpoint | Method | Data | Use |
|----------|--------|------|-----|
| `/api/characters` | GET | All registered players (185+) | Player count, new player tracking |
| `/api/killmails` | GET | Kill events with killer/victim/system | Breaking news, headlines, kill ticker |
| `/api/assemblies/NWN/ONLINE` | GET | Online assemblies (100) | Infrastructure status |
| `/api/tribes` | GET | Factions with member counts | Faction overview |
| `/api/character/{id}` | GET | Character detail (profile, tribe, assemblies) | Drill-down |
| `/api/character/{id}/kills` | GET | Character kill history | Drill-down |
| `/api/character/{id}/assemblies` | GET | Character assemblies | Drill-down |
| `/api/assembly/{id}` | GET | Assembly detail (type, location, state) | Drill-down |
| `/api/assembly/{id}/network` | GET | Assembly network topology | Drill-down |
| `/api/tribe/{id}` | GET | Tribe detail | Drill-down |
| `/api/tribe/{id}/characters` | GET | Tribe members | Drill-down |
| `/static/.../types_index.json` | GET | Item type definitions | Name resolution for typeId |

## Dual-Source Union Strategy

Both sources poll independently every 5 minutes. A `WorldAggregator` merges results using set-union logic:

| Dimension | EVE EYES | Utopia | Merge Logic |
|-----------|----------|--------|-------------|
| Defense activity | turret calls/hr | — | EVE EYES only |
| Infrastructure | network_node calls/hr | assemblies online/total | Union: both kept, different metrics |
| Traffic | gate calls/hr | — | EVE EYES only |
| Combat | — | killmails | Utopia only |
| Players | distinct senders (active) | characters count (registered) | Union: both kept, different semantics |
| Factions | — | tribes | Utopia only |

Each dimension carries `SourceMeta[]` to track:
- Which provider(s) contributed
- When each source was last fetched
- Whether data is stale (>10min since last successful fetch)

If one source goes down, the other continues to serve its dimensions. No dimension goes blank unless its sole provider is down.

## Backend Architecture

### New: `services/src/utopia/client.ts`

```typescript
class UtopiaClient {
  baseUrl: string;              // https://utopia.evedataco.re
  rateLimiter: RateLimiter;     // 5 req/s

  getCharacters(): Promise<PaginatedResponse<UtopiaCharacter>>
  getKillmails(): Promise<PaginatedResponse<UtopiaKillmail>>
  getAssemblies(namespace: string, state: string): Promise<PaginatedResponse<UtopiaAssembly>>
  getTribes(): Promise<PaginatedResponse<UtopiaTribe>>

  // Detail endpoints (for drill-down, called on-demand)
  getCharacter(id: string): Promise<UtopiaCharacterDetail>
  getCharacterKills(id: string): Promise<PaginatedResponse<UtopiaKillmail>>
  getCharacterAssemblies(id: string): Promise<PaginatedResponse<UtopiaAssembly>>
  getAssembly(id: string): Promise<UtopiaAssemblyDetail>
  getAssemblyNetwork(id: string): Promise<PaginatedResponse<UtopiaAssembly>>
  getTribe(id: number): Promise<UtopiaTribeDetail>
  getTribeCharacters(id: number): Promise<PaginatedResponse<UtopiaCharacter>>
}
```

### New: `services/src/utopia/tracker.ts`

```typescript
class UtopiaTracker {
  pollIntervalMs: number;       // 300_000 (5min)

  async pollAll(): Promise<void>
  // 1. Fetch killmails → upsert utopia_killmails
  // 2. Fetch characters → upsert utopia_characters (track count + new last 24h)
  // 3. Fetch assemblies → upsert utopia_assemblies (track online/total)
  // 4. Fetch tribes → upsert utopia_tribes

  start(): void
  stop(): void
}
```

### New: `services/src/aggregator/world-aggregator.ts`

```typescript
class WorldAggregator {
  // Called after either tracker completes a poll cycle
  aggregate(): WorldStatus
  // 1. Read latest from region_activity (EVE EYES)
  // 2. Read latest from utopia_* tables
  // 3. Union-merge into WorldStatus
  // 4. Write to world_status_cache table
  // 5. Attach SourceMeta per dimension
}
```

### New SQLite Tables

```sql
CREATE TABLE utopia_killmails (
  id TEXT PRIMARY KEY,
  killer_id TEXT NOT NULL,
  killer_name TEXT NOT NULL,
  victim_id TEXT NOT NULL,
  victim_name TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  loss_type TEXT NOT NULL,
  solar_system_id INTEGER NOT NULL,
  killed_at INTEGER NOT NULL,
  shard INTEGER NOT NULL DEFAULT 1,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX idx_killmails_killed_at ON utopia_killmails(killed_at);

CREATE TABLE utopia_characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  tribe_id INTEGER,
  tribe_name TEXT,
  tribe_ticker TEXT,
  created_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE utopia_assemblies (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  name TEXT,
  type_id INTEGER NOT NULL,
  anchored_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX idx_assemblies_state ON utopia_assemblies(state);

CREATE TABLE utopia_tribes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_short TEXT NOT NULL,
  description TEXT,
  member_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE world_status_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### New API Route: `/api/world/status`

**`services/src/api/routes/world.ts`**

```
GET /api/world/status
```

Response:

```typescript
interface WorldStatus {
  players: {
    registered: number;         // utopia characters count
    active: number;             // eve-eyes distinct senders
    newLast24h: number;         // utopia characters with createdAt > (now - 24h)
    sources: SourceMeta[];
  };
  combat: {
    kills24h: number;           // utopia killmails count in last 24h
    activeSystems: number;      // distinct solarSystemId in last 24h
    recentKills: KillEntry[];   // top 5 most recent killmails
    sources: SourceMeta[];
  };
  infrastructure: {
    onlineAssemblies: number;   // utopia assemblies where state=ONLINE
    totalAssemblies: number;    // utopia assemblies total
    infraIndex: number;         // eve-eyes network_node calls/hr
    sources: SourceMeta[];
  };
  defense: {
    defenseIndex: number;       // eve-eyes turret calls/hr
    sources: SourceMeta[];
  };
  traffic: {
    trafficIndex: number;       // eve-eyes gate calls/hr
    sources: SourceMeta[];
  };
  factions: {
    count: number;              // utopia tribes count
    largest: { name: string; ticker: string; members: number };
    sources: SourceMeta[];
  };
  updatedAt: number;
}

interface SourceMeta {
  provider: "eve-eyes" | "utopia";
  fetchedAt: number;
  stale: boolean;               // fetchedAt > 10min ago
}

interface KillEntry {
  id: string;
  killerName: string;
  victimName: string;
  lossType: string;
  solarSystemId: number;
  killedAt: number;
}
```

### Detail Proxy Routes (for drill-down)

```
GET /api/world/character/:id      → proxies utopia /api/character/{id}
GET /api/world/character/:id/kills → proxies utopia /api/character/{id}/kills
GET /api/world/assembly/:id       → proxies utopia /api/assembly/{id}
GET /api/world/tribe/:id          → proxies utopia /api/tribe/{id}
```

These proxy through our backend to:
- Validate `:id` parameter format (`/^0x[a-f0-9]{64}$/` for object/address IDs, `/^\d+$/` for tribe numeric IDs) — reject malformed IDs with 400
- Apply rate limiting
- Cache responses (60s TTL)
- Normalize response format

### Startup Integration

**`services/src/index.ts`** changes:
- Import and instantiate `UtopiaTracker`
- Import and instantiate `WorldAggregator`
- On each tracker poll completion, trigger `WorldAggregator.aggregate()`
- Register world routes on Express app

### Configuration

**`services/src/config.ts`** additions:

```typescript
utopiaBaseUrl: string;          // env: UTOPIA_BASE_URL, default: https://utopia.evedataco.re
utopiaPollIntervalMs: number;   // env: UTOPIA_POLL_INTERVAL_MS, default: 300000
worldStalenessMs: number;       // env: WORLD_STALENESS_MS, default: 600000
```

## Frontend Architecture

### New: `app/src/hooks/use-world-status.ts`

```typescript
function useWorldStatus() {
  // GET /api/world/status
  // staleTime: 30_000
  // refetchInterval: 300_000 (sync with backend poll)
  // Returns: { worldStatus, isLoading, isError }
}
```

### New: `app/src/components/WorldStatusBar.tsx`

Horizontal bar below PageHeader metrics. 5 cells:

| Cell | Label | Value | Sub-text | Source |
|------|-------|-------|----------|--------|
| 1 | PILOTS | registered count | +active active | utopia+ee |
| 2 | KILLS 24H | kills24h | activeSystems systems | utopia |
| 3 | ASSEMBLIES | online / total | infra infraIndex | utopia+ee |
| 4 | DEFENSE | defenseIndex | — | eve-eyes |
| 5 | FACTIONS | count | largest ticker | utopia |

Behaviors:
- Each cell clickable → opens drill-down modal
- Stale source → number turns gray + `STALE` badge
- Loading state → skeleton pulse

### New: `app/src/components/KillTicker.tsx`

Sidebar panel showing 5 most recent kills:
```
sun → ramonliao  |  SHIP  |  SYS-30013131
jw01 → yuntao    |  SHIP  |  SYS-30002618
```

Each row clickable → character detail modal.

### Drill-down Modals

All drill-down modals include a "View on SUI Explorer" link:
- Character/Assembly IDs → `https://suiscan.xyz/testnet/object/{id}`
- Provides on-chain verification of data sourced from Utopia/EVE EYES

### Modified: `app/src/app/page.tsx`

1. Import `useWorldStatus()` instead of mock data
2. Add `<WorldStatusBar>` between `<PageHeader>` and main grid
3. Replace `headlines` with `worldStatus.combat.recentKills` mapped to headline format
4. Replace `timelineEvents` with mixed events from kills + assembly changes (sorted by time)
5. Replace Daily Briefing hardcoded text with generated summary from WorldStatus numbers
6. Add `<KillTicker>` to sidebar column
7. Enhance Activity panel with assembly + player counts
8. Remove `import { headlines, timelineEvents } from "@/lib/mock-data"`

### Modified: `app/src/types/index.ts`

Add: `WorldStatus`, `SourceMeta`, `KillEntry`, `WorldStatusResponse`

### Deletable: `app/src/lib/mock-data.ts`

`headlines` and `timelineEvents` no longer needed. `plugins` array may still be used by `/store` page — check before deleting.

## File Change Summary

| Action | Path |
|--------|------|
| New | `services/src/utopia/client.ts` |
| New | `services/src/utopia/tracker.ts` |
| New | `services/src/aggregator/world-aggregator.ts` |
| New | `services/src/api/routes/world.ts` |
| Modify | `services/src/db/schema.ts` — add 5 tables |
| Modify | `services/src/config.ts` — add utopia config |
| Modify | `services/src/index.ts` — start UtopiaTracker + WorldAggregator, register routes |
| New | `app/src/hooks/use-world-status.ts` |
| New | `app/src/components/WorldStatusBar.tsx` |
| New | `app/src/components/KillTicker.tsx` |
| Modify | `app/src/app/page.tsx` — replace mock, add new components |
| Modify | `app/src/types/index.ts` — add WorldStatus types |
| Modify | `app/src/lib/mock-data.ts` — remove headlines/timelineEvents (keep plugins if used) |

## Error Handling

- If Utopia API is down: UtopiaTracker logs error, WorldAggregator serves last cached data with `stale: true`
- If EVE EYES API is down: ActivityTracker logs error, same stale behavior
- If both are down: `/api/world/status` returns last cached `world_status_cache` row
- Frontend: stale data shown with visual indicator, never shows empty dashboard

## Testing Strategy

- Unit tests for UtopiaClient (mock HTTP)
- Unit tests for WorldAggregator (test union logic, stale detection, single-source-down scenarios)
- Integration test for `/api/world/status` endpoint
- Frontend: hook test for `useWorldStatus`
- Monkey tests: malformed API responses, empty arrays, null fields, timestamps in the future
