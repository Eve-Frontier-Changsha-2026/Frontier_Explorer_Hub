# EVE Eyes Full API Integration — Design Spec

**Date:** 2026-03-31
**Scope:** Integrate 11 new EVE Eyes endpoints into FEH backend + frontend (excluding auth 3 + users 2)

---

## Decisions

| Question | Answer |
|----------|--------|
| 整合範圍 | B — 全面整合（13 endpoints 中整合 11 個） |
| API key 存放 | Backend only，前端走 proxy |
| EVE Eyes Auth | 不整合 — 已有 API key，不需要 per-user JWT |
| World endpoints | 混合 — search + detail 即時化，route backend only（前端暫不消費） |
| Users endpoint | 跳過 — 無消費場景 |
| Dashboard 新 section | Leaderboard + Modules Summary |
| Killmails 合併 | 前端合併（非後端），兩源獨立 fetch |

---

## Architecture

### Backend (:3001)

```
EveEyesClient (extend: +9 methods)
  ├─ getKillmails(limit?, status?)
  ├─ getBuildingLeaderboard(limit?, moduleName?)
  ├─ getModuleCallCounts()
  ├─ getModulesSummary()
  ├─ searchSystems(query)
  ├─ getSystemDetail(id)
  ├─ getRoute(originId, destinationId)
  ├─ getTransactionBlockDetail(digest)
  ├─ getMoveCalls(txDigest, callIndex?)  // single move call detail
  └─ getTransactionMoveCalls(digest, includeActionSummary?)

New Proxy Routes (with TTL cache):
  /api/eve-eyes/killmails          → 60s cache
  /api/eve-eyes/leaderboard        → 60s cache
  /api/eve-eyes/modules-summary    → 60s cache
  /api/eve-eyes/systems/search     → 30s cache
  /api/eve-eyes/systems/:id        → 30s cache
  /api/eve-eyes/tx/:digest         → no cache
  /api/eve-eyes/tx/:digest/move-calls → no cache
  /api/eve-eyes/move-call/:txDigest/:callIndex → no cache
  /api/eve-eyes/route              → 30s cache

Existing Changes:
  ActivityTracker → use module-call-counts endpoint (optimization)
  ActivityTracker → trigger WorldAggregator.aggregate() on poll complete
  .env            → set EVE_EYES_API_KEY
  .env.example    → add missing vars (UTOPIA_BASE_URL, UTOPIA_POLL_INTERVAL_MS, WORLD_STALENESS_MS)
```

### Frontend (:3000)

```
New Components:
  BuildingLeaderboard   → fetch /api/eve-eyes/leaderboard
  ModulesSummaryBoard   → fetch /api/eve-eyes/modules-summary

Modified Components:
  KillTicker            → merge world/status kills + eve-eyes/killmails (client-side)
  Map (SystemSearch)    → debounced API call → /api/eve-eyes/systems/search
  Map (SystemDetail)    → live fetch → /api/eve-eyes/systems/:id

Not Changed:
  WorldStatusBar        → still reads /api/world/status (unchanged)
  RegionActivityPanel   → still reads /api/region/:id/summary (unchanged)

New API Client Methods:
  getEveEyesKillmails(limit?)
  getEveEyesLeaderboard(limit?, moduleName?)
  getEveEyesModulesSummary()
  searchSystems(query)
  getSystemDetail(id)

New Hooks:
  useEveEyesKillmails()   → TanStack Query, 30s stale
  useLeaderboard()        → TanStack Query, 60s stale
  useModulesSummary()     → TanStack Query, 60s stale
  useSystemSearch(query)  → TanStack Query, debounced
  useSystemDetail(id)     → TanStack Query, 2min stale
```

---

## Data Flow

### Killmails Merge (Client-Side)

```
/api/world/status → combat.recentKills (KillEntry[], Utopia 源)
/api/eve-eyes/killmails → EveEyesKillmail[] (EVE Eyes 源)

Frontend KillTicker:
  1. useWorldStatus() → utopiaKills
  2. useEveEyesKillmails() → eveKills
  3. Normalize both to KillEvent { id, timestamp, killerName, victimName, source }
  4. Merge, dedup by id, sort by timestamp DESC
  5. Render with source badge ("EVE" | "UTP")
```

### ActivityTracker Optimization

```
Before (3 paginated calls per poll):
  getModuleCallCount('turret')       → GET /api/indexer/move-calls?moduleName=turret&page=1
  getModuleCallCount('network_node') → GET /api/indexer/move-calls?moduleName=network_node&page=1
  getModuleCallCount('gate')         → GET /api/indexer/move-calls?moduleName=gate&page=1
  + 3 more calls for distinct senders (50 results each)
  = 6 API calls per poll

After (1 call per poll):
  getModuleCallCounts() → GET /api/indexer/module-call-counts
  = 1 API call, returns all module counts
  + Active players: use leaderboard owner count as proxy (or keep 3 sender calls)
```

Note: `module-call-counts` returns aggregated counts per module but no sender info.
Active player estimation options:
- Keep existing 3 × 50 sample (acceptable for hackathon)
- Use leaderboard owner count as better proxy
- Mark as "~estimated" in UI

Decision: **Keep existing sender sampling** for active players, only replace the count calls.
This reduces 6 → 4 calls (3 sender queries + 1 module-call-counts).

### Building Leaderboard

```
GET /api/eve-eyes/leaderboard?limit=10&moduleName=gate

Response: {
  leaderboard: [
    { ownerCharacterName, ownerWallet, buildingCount, ... }
  ]
}

Frontend: tab bar for moduleName filter (All | Assembly | Gate | Network Node | Storage Unit | Turret)
Default: no filter (all buildings)
```

### Modules Summary Board

```
GET /api/eve-eyes/modules-summary

Response: {
  modules: [
    { title, href, description, metric, supporting, status }
  ]
}

Note: This is EVE Eyes' PLATFORM FEATURE BOARD, not on-chain module call counts.
Each entry represents an EVE Eyes feature (Atlas, Verify, Fleet, Codex, Tribes, Jumps)
with its status ("live" | "locked") and a headline metric.

Frontend: grid of feature cards showing title + metric + status badge
Use as "EVE Frontier Ecosystem Status" section on Dashboard
```

### Map Instant Search

```
User types in search box → debounce 300ms → GET /api/eve-eyes/systems/search?q=...
Results dropdown → click → GET /api/eve-eyes/systems/:id → detail panel

Fallback: if API fails, search against static eve_systems.json (existing behavior)
```

---

## New Types

### Backend (`services/src/types/index.ts`)

```ts
// EVE Eyes Killmail (from /api/indexer/killmails)
interface EveEyesKillmail {
  killmailItemId: string;
  killTimestamp: string;       // ISO 8601
  lossType: string;            // "SHIP"
  solarSystemId: string;       // numeric string
  resolutionStatus: string;    // "resolved" | "pending"
  killer: {
    label: string;
    username: string;
    walletAddress: string;
    characterItemId: string;
  };
  victim: {
    label: string;
    username: string;
    walletAddress: string;
    characterItemId: string;
  };
}

// Building Leaderboard (from /api/v1/indexer/building-leaderboard)
interface EveEyesLeaderboardEntry {
  rank: number;
  tenant: string;              // "utopia"
  ownerCharacterItemId: string;
  userId: string;
  walletAddress: string;
  buildingCount: number;
  lastSeenAt: string;          // ISO 8601
  username: string;
}

interface EveEyesLeaderboardResponse {
  ok: boolean;
  apiVersion: string;
  auth: { type: string };
  leaderboard: EveEyesLeaderboardEntry[];
}

// Modules Summary (from /api/world/modules-summary)
// Note: this is a feature board, NOT per-module call counts
interface EveEyesModuleSummary {
  title: string;               // "Atlas", "Verify", "Fleet", etc.
  href: string;                // "/atlas", "/verify", etc.
  description: string;
  metric: string;              // "24502 systems", "11 hulls", etc.
  supporting: string;          // additional context
  status: "live" | "locked";
}

interface EveEyesModulesSummaryResponse {
  modules: EveEyesModuleSummary[];
}

// System Search (from /api/world/systems/search)
// Note: search for "jita" returns empty — EVE Frontier uses different system names
// Response shape: { data: SystemSearchResult[] }
interface EveEyesSystemSearchResult {
  id: number;                  // system numeric ID (e.g. 30000142)
  name: string;                // e.g. "EHK-KH7"
  constellationId: number;
  regionId: number;
}

// System Detail (from /api/world/systems/:id)
interface EveEyesSystemDetail {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
  location: {
    x: number;
    y: number;
    z: number;
  };
  gateLinks: unknown[];       // gate connection data
}

// Route (from /api/world/route)
interface EveEyesRouteResponse {
  route: number[];             // array of system IDs
}
```

### Frontend (`next-monorepo/app/src/types/index.ts`)

```ts
// Normalized kill event (merged from both sources)
interface KillEvent {
  id: string;
  timestamp: number;
  killerName: string;
  victimName: string;
  source: "eve-eyes" | "utopia";
}

// Leaderboard
interface LeaderboardEntry {
  rank: number;
  characterName: string | null;
  wallet: string;
  buildingCount: number;
}

// EVE Eyes ecosystem feature status
interface EcosystemFeature {
  title: string;
  metric: string;
  status: "live" | "locked";
}
```

---

## Proxy Route Caching Strategy

Simple in-memory TTL cache per route (no Redis needed for hackathon):

```ts
class RouteCache {
  private cache = new Map<string, { data: unknown; expiresAt: number }>();

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.data;
  }

  set(key: string, data: unknown, ttlMs: number) {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}
```

Each proxy route handler: check cache → if miss, call EveEyesClient → cache response → return.

---

## Security

- API key in backend `.env` only, never exposed to frontend
- Proxy routes validate path params (numeric system ID, hex digest format)
- Rate limiter on EveEyesClient remains at 5 req/sec
- No new auth flows — existing useAuth unchanged

---

## SUI Architect Review Fixes Incorporated

1. ✅ New proxy routes have independent TTL cache, not via WorldAggregator
2. ✅ Killmails merge in frontend, not backend
3. ✅ ActivityTracker triggers aggregate() on poll complete
4. ✅ module-call-counts replaces paginated count calls
5. ✅ .env.example to be completed with missing vars
6. ✅ Type sync comments between frontend/backend

---

## Out of Scope

- EVE Eyes Auth (challenge/login/logout) — not needed with API key
- EVE Eyes Users (GET/POST /api/users) — no consumption scenario
- Route planner frontend UI — backend endpoint only, frontend deferred
- TX Explorer page — backend proxy only, frontend deferred
- Shared type package between frontend/backend — hackathon acceptable as manual sync
