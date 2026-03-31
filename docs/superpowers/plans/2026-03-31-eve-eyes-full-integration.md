# EVE Eyes Full API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 11 new EVE Eyes API endpoints into FEH backend (proxy routes with cache) and frontend (leaderboard, ecosystem status, dual-source kill feed, map instant search).

**Architecture:** Backend extends `EveEyesClient` with 9 new methods, adds `/api/eve-eyes/*` proxy routes with in-memory TTL cache, optimizes `ActivityTracker`. Frontend adds new components (BuildingLeaderboard, EcosystemStatus), merges kill feeds client-side, and instant-ifies map search/detail.

**Tech Stack:** Express, vitest, supertest, React, TanStack Query, @mysten/dapp-kit

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Modify:** `services/src/types/index.ts` | Add EVE Eyes killmail, leaderboard, module summary, system types |
| **Modify:** `services/src/eve-eyes/client.ts` | Add 9 new API methods |
| **Create:** `services/src/api/middleware/route-cache.ts` | Simple in-memory TTL cache for proxy routes |
| **Create:** `services/src/api/routes/eve-eyes.ts` | 9 proxy routes for EVE Eyes endpoints |
| **Modify:** `services/src/api/server.ts` | Wire eve-eyes router |
| **Modify:** `services/src/eve-eyes/activity-tracker.ts` | Use module-call-counts endpoint |
| **Modify:** `services/src/index.ts` | Wire ActivityTracker onPollComplete |
| **Modify:** `services/.env.example` | Add missing env vars |
| **Create:** `services/tests/eve-eyes-routes.test.ts` | Tests for proxy routes |
| **Modify:** `next-monorepo/app/src/types/index.ts` | Add frontend types for killmails, leaderboard, ecosystem |
| **Modify:** `next-monorepo/app/src/lib/api-client.ts` | Add 5 new API client methods |
| **Create:** `next-monorepo/app/src/hooks/use-eve-eyes.ts` | Hooks: useEveKillmails, useLeaderboard, useModulesSummary, useSystemSearch |
| **Create:** `next-monorepo/app/src/components/BuildingLeaderboard.tsx` | Leaderboard component with module filter tabs |
| **Create:** `next-monorepo/app/src/components/EcosystemStatus.tsx` | EVE Eyes platform feature board |
| **Modify:** `next-monorepo/app/src/components/KillTicker.tsx` | Accept dual-source kills with source badge |
| **Modify:** `next-monorepo/app/src/app/page.tsx` | Add leaderboard + ecosystem + merged kills to dashboard |
| **Create:** `next-monorepo/app/src/__tests__/hooks/use-eve-eyes.test.ts` | Hook tests |
| **Create:** `next-monorepo/app/src/__tests__/components/eve-eyes-components.test.tsx` | Component tests |

---

### Task 1: Backend Types

**Files:**
- Modify: `services/src/types/index.ts`

- [ ] **Step 1: Add new types**

Append to `services/src/types/index.ts` after the `UtopiaPaginatedResponse` interface (line ~344):

```ts
// ── EVE EYES extended types ──────────────────────────────────

export interface EveEyesKillmail {
  killmailItemId: string;
  killTimestamp: string;
  lossType: string;
  solarSystemId: string;
  resolutionStatus: string;
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

export interface EveEyesLeaderboardEntry {
  rank: number;
  tenant: string;
  ownerCharacterItemId: string;
  userId: string;
  walletAddress: string;
  buildingCount: number;
  lastSeenAt: string;
  username: string;
}

export interface EveEyesLeaderboardResponse {
  ok: boolean;
  apiVersion: string;
  auth: { type: string };
  leaderboard: EveEyesLeaderboardEntry[];
}

export interface EveEyesModuleSummary {
  title: string;
  href: string;
  description: string;
  metric: string;
  supporting: string;
  status: 'live' | 'locked';
}

export interface EveEyesModulesSummaryResponse {
  modules: EveEyesModuleSummary[];
}

export interface EveEyesModuleCallCount {
  moduleName: string;
  count: number;
}

export interface EveEyesSystemSearchResult {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
}

export interface EveEyesSystemDetail {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
  location: { x: number; y: number; z: number };
  gateLinks: unknown[];
}

export interface EveEyesRouteResponse {
  route: number[];
}

export type EveEyesBuildingModuleName = 'assembly' | 'gate' | 'network_node' | 'storage_unit' | 'turret';
```

- [ ] **Step 2: Verify types compile**

Run: `cd services && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add services/src/types/index.ts
git commit -m "feat(eve-eyes): add types for killmails, leaderboard, modules summary, systems"
```

---

### Task 2: Extend EveEyesClient

**Files:**
- Modify: `services/src/eve-eyes/client.ts`

- [ ] **Step 1: Write failing tests**

Create `services/tests/eve-eyes-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EveEyesClient } from '../src/eve-eyes/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EveEyesClient — new endpoints', () => {
  let client: EveEyesClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new EveEyesClient({
      baseUrl: 'https://eve-eyes.test',
      apiKey: 'test-key',
      rateLimit: 100,
    });
  });

  function mockJsonResponse(data: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    });
  }

  it('getKillmails calls /api/indexer/killmails with params', async () => {
    mockJsonResponse({ items: [] });
    await client.getKillmails(5, 'resolved');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/killmails');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('status')).toBe('resolved');
  });

  it('getLeaderboard calls /api/v1/indexer/building-leaderboard', async () => {
    mockJsonResponse({ ok: true, leaderboard: [] });
    await client.getLeaderboard(10, 'gate');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/indexer/building-leaderboard');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('moduleName')).toBe('gate');
  });

  it('getModuleCallCounts calls /api/indexer/module-call-counts', async () => {
    mockJsonResponse({ modules: [] });
    await client.getModuleCallCounts();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/module-call-counts');
  });

  it('getModulesSummary calls /api/world/modules-summary', async () => {
    mockJsonResponse({ modules: [] });
    await client.getModulesSummary();
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/modules-summary');
  });

  it('searchSystems calls /api/world/systems/search', async () => {
    mockJsonResponse({ data: [] });
    await client.searchSystems('jita');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/systems/search');
    expect(url.searchParams.get('q')).toBe('jita');
  });

  it('getSystemDetail calls /api/world/systems/:id', async () => {
    mockJsonResponse({ id: 30000142 });
    await client.getSystemDetail(30000142);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/systems/30000142');
  });

  it('getRoute calls /api/world/route', async () => {
    mockJsonResponse({ route: [1, 2, 3] });
    await client.getRoute(30000142, 30002510);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/world/route');
    expect(url.searchParams.get('originId')).toBe('30000142');
    expect(url.searchParams.get('destinationId')).toBe('30002510');
  });

  it('getTransactionBlockDetail calls /api/indexer/transaction-blocks/:digest', async () => {
    mockJsonResponse({ item: {} });
    await client.getTransactionBlockDetail('abc123');
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/transaction-blocks/abc123');
  });

  it('getMoveCallDetail calls /api/indexer/move-calls/:txDigest/:callIndex', async () => {
    mockJsonResponse({ item: {} });
    await client.getMoveCallDetail('abc123', 0);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/indexer/move-calls/abc123/0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npx vitest run tests/eve-eyes-client.test.ts`
Expected: FAIL — methods don't exist

- [ ] **Step 3: Add new methods to EveEyesClient**

Append to `services/src/eve-eyes/client.ts`, inside the `EveEyesClient` class, after the `getModuleCallsBySender` method:

```ts
  // ── Killmails ──────────────────────────────────────────────

  async getKillmails(
    limit?: number,
    status?: string,
  ): Promise<{ items: import('../types/index.js').EveEyesKillmail[] }> {
    return this.request('/api/indexer/killmails', { limit, status });
  }

  // ── Building Leaderboard ───────────────────────────────────

  async getLeaderboard(
    limit?: number,
    moduleName?: import('../types/index.js').EveEyesBuildingModuleName,
  ): Promise<import('../types/index.js').EveEyesLeaderboardResponse> {
    return this.request('/api/v1/indexer/building-leaderboard', { limit, moduleName });
  }

  // ── Module Call Counts ─────────────────────────────────────

  async getModuleCallCounts(): Promise<{ modules: import('../types/index.js').EveEyesModuleCallCount[] }> {
    return this.request('/api/indexer/module-call-counts', {});
  }

  // ── Modules Summary ───────────────────────────────────────

  async getModulesSummary(): Promise<import('../types/index.js').EveEyesModulesSummaryResponse> {
    return this.request('/api/world/modules-summary', {});
  }

  // ── Systems ────────────────────────────────────────────────

  async searchSystems(
    query: string,
  ): Promise<{ data: import('../types/index.js').EveEyesSystemSearchResult[] }> {
    return this.request('/api/world/systems/search', { q: query });
  }

  async getSystemDetail(
    id: number,
  ): Promise<import('../types/index.js').EveEyesSystemDetail> {
    return this.request(`/api/world/systems/${id}`, {});
  }

  // ── Route ──────────────────────────────────────────────────

  async getRoute(
    originId: number,
    destinationId: number,
  ): Promise<import('../types/index.js').EveEyesRouteResponse> {
    return this.request('/api/world/route', { originId, destinationId });
  }

  // ── Transaction / Move Call Detail ─────────────────────────

  async getTransactionBlockDetail(digest: string): Promise<unknown> {
    return this.request(`/api/indexer/transaction-blocks/${digest}`, {});
  }

  async getTransactionMoveCalls(
    digest: string,
    includeActionSummary?: boolean,
  ): Promise<{ items: unknown[] }> {
    return this.request(`/api/indexer/transaction-blocks/${digest}/move-calls`, {
      includeActionSummary: includeActionSummary ? 1 : undefined,
    });
  }

  async getMoveCallDetail(
    txDigest: string,
    callIndex: number,
  ): Promise<unknown> {
    return this.request(`/api/indexer/move-calls/${txDigest}/${callIndex}`, {});
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services && npx vitest run tests/eve-eyes-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/src/eve-eyes/client.ts services/tests/eve-eyes-client.test.ts
git commit -m "feat(eve-eyes): extend client with 9 new API methods"
```

---

### Task 3: RouteCache + Proxy Routes

**Files:**
- Create: `services/src/api/middleware/route-cache.ts`
- Create: `services/src/api/routes/eve-eyes.ts`
- Modify: `services/src/api/server.ts`

- [ ] **Step 1: Write failing test**

Create `services/tests/eve-eyes-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import type Database from 'better-sqlite3';

// Mock the EveEyesClient singleton
vi.mock('../src/eve-eyes/client.js', () => {
  const mockClient = {
    getKillmails: vi.fn().mockResolvedValue({ items: [{ killmailItemId: '1', killTimestamp: '2026-03-30T21:17:32.000Z', lossType: 'SHIP', solarSystemId: '30013131', resolutionStatus: 'resolved', killer: { label: 'sun', username: 'sun', walletAddress: '0xa', characterItemId: '1' }, victim: { label: 'moon', username: 'moon', walletAddress: '0xb', characterItemId: '2' } }] }),
    getLeaderboard: vi.fn().mockResolvedValue({ ok: true, apiVersion: 'v1', auth: { type: 'apiKey' }, leaderboard: [{ rank: 1, tenant: 'utopia', ownerCharacterItemId: '1', userId: '1', walletAddress: '0xa', buildingCount: 54, lastSeenAt: '2026-03-26T12:48:36Z', username: 'lacal' }] }),
    getModulesSummary: vi.fn().mockResolvedValue({ modules: [{ title: 'Atlas', href: '/atlas', description: 'Search systems', metric: '24502 systems', supporting: '2213 constellations', status: 'live' }] }),
    searchSystems: vi.fn().mockResolvedValue({ data: [{ id: 30000142, name: 'EHK-KH7', constellationId: 20000011, regionId: 10000005 }] }),
    getSystemDetail: vi.fn().mockResolvedValue({ id: 30000142, name: 'EHK-KH7', constellationId: 20000011, regionId: 10000005, location: { x: 0, y: 0, z: 0 }, gateLinks: [] }),
    getRoute: vi.fn().mockResolvedValue({ route: [30000142, 30000143, 30002510] }),
    getTransactionBlockDetail: vi.fn().mockResolvedValue({ item: { digest: 'abc' } }),
    getTransactionMoveCalls: vi.fn().mockResolvedValue({ items: [] }),
    getMoveCallDetail: vi.fn().mockResolvedValue({ item: {} }),
  };
  return {
    getEveEyesClient: () => mockClient,
    EveEyesClient: vi.fn(),
    __mockClient: mockClient,
  };
});

let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  db = getTestDb();
  app = createApp({ db });
});

afterAll(() => {
  db.close();
});

describe('EVE Eyes proxy routes', () => {
  it('GET /api/eve-eyes/killmails returns killmails', async () => {
    const res = await request(app).get('/api/eve-eyes/killmails');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].killmailItemId).toBe('1');
  });

  it('GET /api/eve-eyes/leaderboard returns leaderboard', async () => {
    const res = await request(app).get('/api/eve-eyes/leaderboard?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toHaveLength(1);
  });

  it('GET /api/eve-eyes/modules-summary returns modules', async () => {
    const res = await request(app).get('/api/eve-eyes/modules-summary');
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(1);
  });

  it('GET /api/eve-eyes/systems/search returns results', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/search?q=EHK');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /api/eve-eyes/systems/search requires q param', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/search');
    expect(res.status).toBe(400);
  });

  it('GET /api/eve-eyes/systems/:id returns system detail', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/30000142');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('EHK-KH7');
  });

  it('GET /api/eve-eyes/systems/:id rejects non-numeric id', async () => {
    const res = await request(app).get('/api/eve-eyes/systems/abc');
    expect(res.status).toBe(400);
  });

  it('GET /api/eve-eyes/route returns route', async () => {
    const res = await request(app).get('/api/eve-eyes/route?originId=30000142&destinationId=30002510');
    expect(res.status).toBe(200);
    expect(res.body.route).toHaveLength(3);
  });

  it('GET /api/eve-eyes/route requires both params', async () => {
    const res = await request(app).get('/api/eve-eyes/route?originId=30000142');
    expect(res.status).toBe(400);
  });

  it('GET /api/eve-eyes/tx/:digest returns tx detail', async () => {
    const res = await request(app).get('/api/eve-eyes/tx/abc123');
    expect(res.status).toBe(200);
  });

  it('GET /api/eve-eyes/tx/:digest/move-calls returns move calls', async () => {
    const res = await request(app).get('/api/eve-eyes/tx/abc123/move-calls');
    expect(res.status).toBe(200);
  });

  it('GET /api/eve-eyes/move-call/:txDigest/:callIndex returns detail', async () => {
    const res = await request(app).get('/api/eve-eyes/move-call/abc123/0');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npx vitest run tests/eve-eyes-routes.test.ts`
Expected: FAIL — routes don't exist (404)

- [ ] **Step 3: Create RouteCache**

Create `services/src/api/middleware/route-cache.ts`:

```ts
export class RouteCache {
  private cache = new Map<string, { data: unknown; expiresAt: number }>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}
```

- [ ] **Step 4: Create eve-eyes routes**

Create `services/src/api/routes/eve-eyes.ts`:

```ts
import { Router } from 'express';
import { getEveEyesClient } from '../../eve-eyes/client.js';
import { RouteCache } from '../middleware/route-cache.js';

const NUMERIC_RE = /^\d+$/;
const CACHE_60S = 60_000;
const CACHE_30S = 30_000;

export function createEveEyesRouter(): Router {
  const router = Router();
  const cache = new RouteCache();
  const client = getEveEyesClient();

  // ── Killmails ──
  router.get('/eve-eyes/killmails', async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const status = req.query.status as string | undefined;
    const cacheKey = `killmails:${limit}:${status}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getKillmails(limit, status);
      cache.set(cacheKey, data, CACHE_60S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch killmails from EVE EYES' });
    }
  });

  // ── Leaderboard ──
  router.get('/eve-eyes/leaderboard', async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const moduleName = req.query.moduleName as string | undefined;
    const cacheKey = `leaderboard:${limit}:${moduleName}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getLeaderboard(limit, moduleName as never);
      cache.set(cacheKey, data, CACHE_60S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch leaderboard from EVE EYES' });
    }
  });

  // ── Modules Summary ──
  router.get('/eve-eyes/modules-summary', async (_req, res) => {
    const cached = cache.get('modules-summary');
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getModulesSummary();
      cache.set('modules-summary', data, CACHE_60S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch modules summary from EVE EYES' });
    }
  });

  // ── Systems Search ──
  router.get('/eve-eyes/systems/search', async (req, res) => {
    const q = req.query.q as string;
    if (!q) { res.status(400).json({ error: 'Missing q parameter' }); return; }
    const cacheKey = `systems-search:${q}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.searchSystems(q);
      cache.set(cacheKey, data, CACHE_30S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to search systems' });
    }
  });

  // ── System Detail ──
  router.get('/eve-eyes/systems/:id', async (req, res) => {
    const { id } = req.params;
    if (!NUMERIC_RE.test(id)) { res.status(400).json({ error: 'System ID must be numeric' }); return; }
    const cacheKey = `system:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getSystemDetail(parseInt(id, 10));
      cache.set(cacheKey, data, CACHE_30S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch system detail' });
    }
  });

  // ── Route ──
  router.get('/eve-eyes/route', async (req, res) => {
    const originId = req.query.originId as string;
    const destinationId = req.query.destinationId as string;
    if (!originId || !destinationId || !NUMERIC_RE.test(originId) || !NUMERIC_RE.test(destinationId)) {
      res.status(400).json({ error: 'originId and destinationId are required (numeric)' });
      return;
    }
    const cacheKey = `route:${originId}:${destinationId}`;
    const cached = cache.get(cacheKey);
    if (cached) { res.json(cached); return; }
    try {
      const data = await client.getRoute(parseInt(originId, 10), parseInt(destinationId, 10));
      cache.set(cacheKey, data, CACHE_30S);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to compute route' });
    }
  });

  // ── Transaction Detail ──
  router.get('/eve-eyes/tx/:digest', async (req, res) => {
    try {
      const data = await client.getTransactionBlockDetail(req.params.digest);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch transaction detail' });
    }
  });

  // ── Transaction Move Calls ──
  router.get('/eve-eyes/tx/:digest/move-calls', async (req, res) => {
    try {
      const data = await client.getTransactionMoveCalls(
        req.params.digest,
        req.query.includeActionSummary === '1',
      );
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch move calls' });
    }
  });

  // ── Move Call Detail ──
  router.get('/eve-eyes/move-call/:txDigest/:callIndex', async (req, res) => {
    const { txDigest, callIndex } = req.params;
    if (!NUMERIC_RE.test(callIndex)) { res.status(400).json({ error: 'callIndex must be numeric' }); return; }
    try {
      const data = await client.getMoveCallDetail(txDigest, parseInt(callIndex, 10));
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch move call detail' });
    }
  });

  return router;
}
```

- [ ] **Step 5: Wire router in server.ts**

Edit `services/src/api/server.ts` — add import and mount:

Add import:
```ts
import { createEveEyesRouter } from './routes/eve-eyes.js';
```

After `app.use('/api', createWorldRouter(db));` add:
```ts
  app.use('/api', createEveEyesRouter());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd services && npx vitest run tests/eve-eyes-routes.test.ts`
Expected: PASS

- [ ] **Step 7: Run full backend tests**

Run: `cd services && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 8: Commit**

```bash
git add services/src/api/middleware/route-cache.ts services/src/api/routes/eve-eyes.ts services/src/api/server.ts services/tests/eve-eyes-routes.test.ts
git commit -m "feat(eve-eyes): add proxy routes with TTL cache for 9 endpoints"
```

---

### Task 4: Optimize ActivityTracker + onPollComplete Wiring

**Files:**
- Modify: `services/src/eve-eyes/activity-tracker.ts`
- Modify: `services/src/index.ts`
- Modify: `services/.env.example`

- [ ] **Step 1: Modify ActivityTracker to use module-call-counts**

Edit `services/src/eve-eyes/activity-tracker.ts`:

Replace the `pollActivity` method body with:

```ts
  async pollActivity(): Promise<void> {
    const now = Date.now();
    const windowStart = now - WINDOW_HOURS * 60 * 60 * 1000;

    // Use aggregated endpoint instead of 3 separate paginated calls
    let turretTotal = 0;
    let nodeTotal = 0;
    let gateTotal = 0;
    try {
      const { modules } = await this.client.getModuleCallCounts();
      for (const mod of modules) {
        // module-call-counts returns objects — extract counts by name match
        if (typeof mod === 'object' && mod !== null) {
          // The API returns objects with varying shapes — safely extract
          const name = String((mod as Record<string, unknown>).title ?? (mod as Record<string, unknown>).moduleName ?? '').toLowerCase();
          const count = Number((mod as Record<string, unknown>).count ?? (mod as Record<string, unknown>).metric ?? 0);
          if (name.includes('turret')) turretTotal = count;
          else if (name.includes('network_node') || name.includes('network node')) nodeTotal = count;
          else if (name.includes('gate')) gateTotal = count;
        }
      }
    } catch {
      // Fallback to individual calls if new endpoint fails
      [turretTotal, nodeTotal, gateTotal] = await Promise.all([
        this.client.getModuleCallCount('turret'),
        this.client.getModuleCallCount('network_node'),
        this.client.getModuleCallCount('gate'),
      ]);
    }

    const defenseIndex = turretTotal / WINDOW_HOURS;
    const infraIndex = nodeTotal / WINDOW_HOURS;
    const trafficIndex = gateTotal / WINDOW_HOURS;

    // Estimate active players: get recent pages and count distinct senders
    const senders = new Set<string>();
    const modules = ['turret', 'network_node', 'gate'] as const;
    for (const mod of modules) {
      const res = await this.client.getMoveCalls({ moduleName: mod }, 1, 50);
      for (const call of res.items) {
        senders.add(call.senderAddress);
      }
    }

    this.db
      .prepare(
        `INSERT INTO region_activity
          (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(null, defenseIndex, infraIndex, trafficIndex, senders.size, windowStart, now, now);
  }
```

Also add `onPollComplete` callback support. Add property and modify `start()`:

After `private pollIntervalMs: number;` add:
```ts
  onPollComplete: (() => void) | null = null;
```

Replace `start()` method:
```ts
  start(): void {
    const runPoll = () => {
      void this.pollActivity()
        .then(() => { this.onPollComplete?.(); })
        .catch((err) => console.error('[ActivityTracker] poll error:', err));
    };
    runPoll();
    this.intervalHandle = setInterval(runPoll, this.pollIntervalMs);
  }
```

- [ ] **Step 2: Wire onPollComplete in index.ts**

Edit `services/src/index.ts`. After the `tracker.start()` line (around line 57), the tracker variable is typed as `{ start(): void; stop(): void }`. Change the type to include `onPollComplete`:

Replace:
```ts
  const trackerMod = await tryImport<{
    ActivityTracker: new (...args: unknown[]) => { start(): void; stop(): void };
  }>('./eve-eyes/activity-tracker.js');
  let tracker: { start(): void; stop(): void } | null = null;
  if (trackerMod) {
    tracker = new trackerMod.ActivityTracker(db, eveEyesClient);
    tracker.start();
    console.log('[main] ActivityTracker started');
```

With:
```ts
  const trackerMod = await tryImport<{
    ActivityTracker: new (...args: unknown[]) => { start(): void; stop(): void; onPollComplete?: (() => void) | null };
  }>('./eve-eyes/activity-tracker.js');
  let tracker: { start(): void; stop(): void; onPollComplete?: (() => void) | null } | null = null;
  if (trackerMod) {
    tracker = new trackerMod.ActivityTracker(db, eveEyesClient);
    tracker.start();
    console.log('[main] ActivityTracker started');
```

Then, after the `worldAggregator` is created (after `console.log('[main] WorldAggregator ready');`), add:

```ts
    // Wire ActivityTracker → WorldAggregator
    if (tracker && tracker.onPollComplete !== undefined) {
      tracker.onPollComplete = () => {
        try { worldAggregator!.aggregate(); } catch (e) { console.error('[main] WorldAggregator error (activity):', e); }
      };
    }
```

- [ ] **Step 3: Fix .env.example**

Append to `services/.env.example`:

```
# Utopia
UTOPIA_BASE_URL=https://utopia.evedataco.re
UTOPIA_POLL_INTERVAL_MS=300000

# World aggregation
WORLD_STALENESS_MS=600000
```

- [ ] **Step 4: Run backend tests**

Run: `cd services && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add services/src/eve-eyes/activity-tracker.ts services/src/index.ts services/.env.example
git commit -m "feat(eve-eyes): optimize ActivityTracker with module-call-counts + onPollComplete"
```

---

### Task 5: Frontend Types + API Client

**Files:**
- Modify: `next-monorepo/app/src/types/index.ts`
- Modify: `next-monorepo/app/src/lib/api-client.ts`

- [ ] **Step 1: Add frontend types**

Append to `next-monorepo/app/src/types/index.ts`:

```ts
// ── EVE EYES extended types (sync with services/src/types) ───

export interface EveEyesKillmail {
  killmailItemId: string;
  killTimestamp: string;
  lossType: string;
  solarSystemId: string;
  resolutionStatus: string;
  killer: { label: string; username: string; walletAddress: string; characterItemId: string };
  victim: { label: string; username: string; walletAddress: string; characterItemId: string };
}

export interface LeaderboardEntry {
  rank: number;
  tenant: string;
  ownerCharacterItemId: string;
  userId: string;
  walletAddress: string;
  buildingCount: number;
  lastSeenAt: string;
  username: string;
}

export interface EcosystemFeature {
  title: string;
  href: string;
  description: string;
  metric: string;
  supporting: string;
  status: "live" | "locked";
}

export interface SystemSearchResult {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
}

export interface SystemDetail {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
  location: { x: number; y: number; z: number };
  gateLinks: unknown[];
}

// Normalized kill event (merged from both sources)
export interface KillEvent {
  id: string;
  timestamp: number;
  killerName: string;
  victimName: string;
  lossType: string;
  solarSystemId: string | number;
  source: "eve-eyes" | "utopia";
}
```

- [ ] **Step 2: Add API client methods**

Append to `next-monorepo/app/src/lib/api-client.ts`:

```ts
// ── EVE EYES proxy endpoints ─────────────────────────────────

export function getEveEyesKillmails(limit = 20) {
  return apiFetch<{ items: import("@/types").EveEyesKillmail[] }>(`/api/eve-eyes/killmails?limit=${limit}`);
}

export function getEveEyesLeaderboard(limit = 10, moduleName?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (moduleName) params.set("moduleName", moduleName);
  return apiFetch<{ ok: boolean; leaderboard: import("@/types").LeaderboardEntry[] }>(`/api/eve-eyes/leaderboard?${params}`);
}

export function getEveEyesModulesSummary() {
  return apiFetch<{ modules: import("@/types").EcosystemFeature[] }>("/api/eve-eyes/modules-summary");
}

export function searchEveEyesSystems(query: string) {
  return apiFetch<{ data: import("@/types").SystemSearchResult[] }>(`/api/eve-eyes/systems/search?q=${encodeURIComponent(query)}`);
}

export function getEveEyesSystemDetail(id: number) {
  return apiFetch<import("@/types").SystemDetail>(`/api/eve-eyes/systems/${id}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/api-client.ts
git commit -m "feat(eve-eyes): add frontend types and API client methods"
```

---

### Task 6: Frontend Hooks

**Files:**
- Create: `next-monorepo/app/src/hooks/use-eve-eyes.ts`
- Create: `next-monorepo/app/src/__tests__/hooks/use-eve-eyes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `next-monorepo/app/src/__tests__/hooks/use-eve-eyes.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/api-client", () => ({
  getEveEyesKillmails: vi.fn().mockResolvedValue({
    items: [{
      killmailItemId: "1", killTimestamp: "2026-03-30T21:17:32.000Z",
      lossType: "SHIP", solarSystemId: "30013131", resolutionStatus: "resolved",
      killer: { label: "sun", username: "sun", walletAddress: "0xa", characterItemId: "1" },
      victim: { label: "moon", username: "moon", walletAddress: "0xb", characterItemId: "2" },
    }],
  }),
  getEveEyesLeaderboard: vi.fn().mockResolvedValue({
    ok: true, leaderboard: [{ rank: 1, tenant: "utopia", ownerCharacterItemId: "1", userId: "1", walletAddress: "0xa", buildingCount: 54, lastSeenAt: "2026-03-26T12:48:36Z", username: "lacal" }],
  }),
  getEveEyesModulesSummary: vi.fn().mockResolvedValue({
    modules: [{ title: "Atlas", href: "/atlas", description: "Search", metric: "24502 systems", supporting: "2213 constellations", status: "live" }],
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("EVE Eyes hooks", () => {
  it("useEveKillmails returns killmail data", async () => {
    const { useEveKillmails } = await import("@/hooks/use-eve-eyes");
    const { result } = renderHook(() => useEveKillmails(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killmails).toHaveLength(1);
    expect(result.current.killmails![0].killmailItemId).toBe("1");
  });

  it("useLeaderboard returns leaderboard data", async () => {
    const { useLeaderboard } = await import("@/hooks/use-eve-eyes");
    const { result } = renderHook(() => useLeaderboard(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.leaderboard).toHaveLength(1);
    expect(result.current.leaderboard![0].username).toBe("lacal");
  });

  it("useModulesSummary returns modules data", async () => {
    const { useModulesSummary } = await import("@/hooks/use-eve-eyes");
    const { result } = renderHook(() => useModulesSummary(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.modules).toHaveLength(1);
    expect(result.current.modules![0].title).toBe("Atlas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-eve-eyes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create hooks**

Create `next-monorepo/app/src/hooks/use-eve-eyes.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getEveEyesKillmails,
  getEveEyesLeaderboard,
  getEveEyesModulesSummary,
} from "@/lib/api-client";

export function useEveKillmails(limit = 20) {
  const query = useQuery({
    queryKey: ["eveEyesKillmails", limit],
    queryFn: () => getEveEyesKillmails(limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    killmails: query.data?.items ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useLeaderboard(limit = 10, moduleName?: string) {
  const query = useQuery({
    queryKey: ["eveEyesLeaderboard", limit, moduleName],
    queryFn: () => getEveEyesLeaderboard(limit, moduleName),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  return {
    leaderboard: query.data?.leaderboard ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useModulesSummary() {
  const query = useQuery({
    queryKey: ["eveEyesModulesSummary"],
    queryFn: getEveEyesModulesSummary,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  return {
    modules: query.data?.modules ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-eve-eyes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/hooks/use-eve-eyes.ts next-monorepo/app/src/__tests__/hooks/use-eve-eyes.test.ts
git commit -m "feat(eve-eyes): add useEveKillmails, useLeaderboard, useModulesSummary hooks"
```

---

### Task 7: BuildingLeaderboard + EcosystemStatus Components

**Files:**
- Create: `next-monorepo/app/src/components/BuildingLeaderboard.tsx`
- Create: `next-monorepo/app/src/components/EcosystemStatus.tsx`
- Create: `next-monorepo/app/src/__tests__/components/eve-eyes-components.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `next-monorepo/app/src/__tests__/components/eve-eyes-components.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuildingLeaderboard } from "@/components/BuildingLeaderboard";
import { EcosystemStatus } from "@/components/EcosystemStatus";
import type { LeaderboardEntry, EcosystemFeature } from "@/types";

describe("BuildingLeaderboard", () => {
  const entries: LeaderboardEntry[] = [
    { rank: 1, tenant: "utopia", ownerCharacterItemId: "1", userId: "1", walletAddress: "0xad0221857e57908707762a74b68e6f340b06a6e9f991c270ae9c06cf1a92fb71", buildingCount: 54, lastSeenAt: "2026-03-26T12:48:36Z", username: "lacal" },
    { rank: 2, tenant: "utopia", ownerCharacterItemId: "2", userId: "2", walletAddress: "0xff0932fca8fa5ce33289f347278b2fc1201fbfa0f91aac76912a7f5e161b0f47", buildingCount: 14, lastSeenAt: "2026-03-16T16:00:16Z", username: "Warkus" },
  ];

  it("renders leaderboard entries", () => {
    render(<BuildingLeaderboard entries={entries} />);
    expect(screen.getByText("lacal")).toBeTruthy();
    expect(screen.getByText("Warkus")).toBeTruthy();
    expect(screen.getByText("54")).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
  });

  it("renders empty state", () => {
    render(<BuildingLeaderboard entries={[]} />);
    expect(screen.getByText(/no building data/i)).toBeTruthy();
  });

  it("renders loading state", () => {
    render(<BuildingLeaderboard entries={null} isLoading />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});

describe("EcosystemStatus", () => {
  const features: EcosystemFeature[] = [
    { title: "Atlas", href: "/atlas", description: "Search systems", metric: "24502 systems", supporting: "2213 constellations", status: "live" },
    { title: "Jumps", href: "/jumps", description: "Travel history", metric: "Token required", supporting: "", status: "locked" },
  ];

  it("renders feature cards", () => {
    render(<EcosystemStatus features={features} />);
    expect(screen.getByText("Atlas")).toBeTruthy();
    expect(screen.getByText("Jumps")).toBeTruthy();
    expect(screen.getByText("24502 systems")).toBeTruthy();
  });

  it("shows live/locked badges", () => {
    render(<EcosystemStatus features={features} />);
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.getByText("LOCKED")).toBeTruthy();
  });

  it("renders empty state", () => {
    render(<EcosystemStatus features={null} isLoading />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/eve-eyes-components.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 3: Create BuildingLeaderboard**

Create `next-monorepo/app/src/components/BuildingLeaderboard.tsx`:

```tsx
"use client";

import { Panel } from "@/components/ui/Panel";
import type { LeaderboardEntry } from "@/types";

interface Props {
  entries: LeaderboardEntry[] | null;
  isLoading?: boolean;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function BuildingLeaderboard({ entries, isLoading }: Props) {
  if (isLoading || entries === null) {
    return (
      <Panel title="Building Leaderboard" badge="EVE EYES">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60 animate-pulse-dot">Loading...</p>
      </Panel>
    );
  }

  if (entries.length === 0) {
    return (
      <Panel title="Building Leaderboard" badge="EVE EYES">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60">No building data available</p>
      </Panel>
    );
  }

  return (
    <Panel title="Building Leaderboard" badge="EVE EYES">
      <div className="mt-2 grid gap-1">
        {entries.map((entry) => (
          <div
            key={entry.walletAddress}
            className="flex items-center justify-between border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-[0.66rem] text-eve-muted/50 w-5 text-right">
                #{entry.rank}
              </span>
              <span className="text-xs text-eve-gold">
                {entry.username || truncateAddr(entry.walletAddress)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{entry.buildingCount}</span>
              <span className="text-[0.6rem] text-eve-muted/50 border border-eve-panel-border/30 px-1 py-0.5">
                {truncateAddr(entry.walletAddress)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Create EcosystemStatus**

Create `next-monorepo/app/src/components/EcosystemStatus.tsx`:

```tsx
"use client";

import { Panel } from "@/components/ui/Panel";
import type { EcosystemFeature } from "@/types";

interface Props {
  features: EcosystemFeature[] | null;
  isLoading?: boolean;
}

export function EcosystemStatus({ features, isLoading }: Props) {
  if (isLoading || features === null) {
    return (
      <Panel title="EVE Frontier Ecosystem" badge="STATUS">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60 animate-pulse-dot">Loading...</p>
      </Panel>
    );
  }

  return (
    <Panel title="EVE Frontier Ecosystem" badge="STATUS">
      <div className="mt-2 grid grid-cols-2 gap-1.5 max-sm:grid-cols-1">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-eve-cold">{feature.title}</span>
              <span
                className={`text-[0.58rem] border px-1 py-0.5 ${
                  feature.status === "live"
                    ? "border-green-500/40 text-green-400"
                    : "border-eve-panel-border text-eve-muted/50"
                }`}
              >
                {feature.status === "live" ? "LIVE" : "LOCKED"}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium">{feature.metric}</p>
            <p className="mt-0.5 text-[0.65rem] text-eve-muted/60 line-clamp-1">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/eve-eyes-components.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/components/BuildingLeaderboard.tsx next-monorepo/app/src/components/EcosystemStatus.tsx next-monorepo/app/src/__tests__/components/eve-eyes-components.test.tsx
git commit -m "feat(eve-eyes): add BuildingLeaderboard and EcosystemStatus components"
```

---

### Task 8: KillTicker Dual-Source Merge + Dashboard Integration

**Files:**
- Modify: `next-monorepo/app/src/components/KillTicker.tsx`
- Modify: `next-monorepo/app/src/app/page.tsx`

- [ ] **Step 1: Modify KillTicker to support source badge**

Edit `next-monorepo/app/src/components/KillTicker.tsx`:

Replace entire file:

```tsx
"use client";

import { Panel } from "@/components/ui/Panel";
import type { KillEvent } from "@/types";

interface Props {
  kills: KillEvent[];
}

export function KillTicker({ kills }: Props) {
  if (kills.length === 0) {
    return (
      <Panel title="Kill Ticker" badge="LIVE">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60">No recent kills</p>
      </Panel>
    );
  }

  return (
    <Panel title="Kill Ticker" badge="LIVE">
      <div className="mt-2 grid gap-1.5">
        {kills.map((kill) => (
          <div
            key={`${kill.source}-${kill.id}`}
            className="flex items-center justify-between border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-1.5 transition-colors"
          >
            <div className="text-[0.7rem]">
              <span className="text-red-400">{kill.killerName}</span>
              <span className="text-eve-muted/50 mx-1">&rarr;</span>
              <span className="text-eve-muted">{kill.victimName}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-[0.6rem] text-eve-muted/50 border border-eve-panel-border/30 px-1 py-0.5">
                {kill.lossType}
              </span>
              <span className="text-[0.6rem] text-eve-muted/50 border border-eve-panel-border/30 px-1 py-0.5">
                SYS-{kill.solarSystemId}
              </span>
              <span
                className={`text-[0.55rem] border px-1 py-0.5 ${
                  kill.source === "eve-eyes"
                    ? "border-blue-500/40 text-blue-400"
                    : "border-amber-500/40 text-amber-400"
                }`}
              >
                {kill.source === "eve-eyes" ? "EVE" : "UTP"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: Modify Dashboard to integrate everything**

Edit `next-monorepo/app/src/app/page.tsx`:

Add imports at the top:
```tsx
import { BuildingLeaderboard } from "@/components/BuildingLeaderboard";
import { EcosystemStatus } from "@/components/EcosystemStatus";
import { useEveKillmails, useLeaderboard, useModulesSummary } from "@/hooks/use-eve-eyes";
import type { KillEvent } from "@/types";
```

Remove the existing `import type { KillEntry } from "@/types";` line.

Inside `HomePage`, after the existing `const recentKills = ...` line, add the new hooks and merge logic:

```tsx
  const { killmails: eveKills } = useEveKillmails();
  const { leaderboard, isLoading: lbLoading } = useLeaderboard();
  const { modules: ecosystemFeatures, isLoading: ecoLoading } = useModulesSummary();

  // Merge kills from both sources into KillEvent[]
  const mergedKills: KillEvent[] = (() => {
    const events: KillEvent[] = [];
    // Utopia kills
    for (const kill of recentKills) {
      events.push({
        id: kill.id,
        timestamp: kill.killedAt,
        killerName: kill.killerName,
        victimName: kill.victimName,
        lossType: kill.lossType,
        solarSystemId: kill.solarSystemId,
        source: "utopia",
      });
    }
    // EVE Eyes kills
    if (eveKills) {
      for (const kill of eveKills) {
        events.push({
          id: kill.killmailItemId,
          timestamp: new Date(kill.killTimestamp).getTime(),
          killerName: kill.killer.label,
          victimName: kill.victim.label,
          lossType: kill.lossType,
          solarSystemId: kill.solarSystemId,
          source: "eve-eyes",
        });
      }
    }
    // Sort by timestamp DESC, dedup by id
    const seen = new Set<string>();
    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
  })();
```

Update the `headlines` and `timelineEvents` to use `mergedKills` instead of `recentKills`:

Replace `const headlines = recentKills.map(...)` with:
```tsx
  const headlines = mergedKills.slice(0, 5).map((kill, i) => ({
    id: `KILL-${i}`,
    title: `${kill.killerName} destroyed ${kill.victimName}'s ${kill.lossType.toLowerCase()}`,
    summary: `Kill reported in system ${kill.solarSystemId}`,
    risk: killToRisk({ ...kill, killedAt: kill.timestamp } as never) as RiskLevel,
    category: "Combat",
    ts: formatTime(kill.timestamp) + " UTC",
  }));
```

Replace `const timelineEvents = recentKills.map(...)` with:
```tsx
  const timelineEvents = mergedKills.slice(0, 5).map((kill, i) => ({
    id: `EV-${i}`,
    title: `${kill.killerName} → ${kill.victimName}`,
    age: formatAge(kill.timestamp),
    detail: `${kill.lossType} lost in system ${kill.solarSystemId}`,
  }));
```

Update `breaking` to use mergedKills:
```tsx
  const breaking = mergedKills[0];
```

Update the breaking panel to use `breaking.timestamp` instead of `breaking.killedAt` and `breaking.killerName`/`breaking.victimName` (already correct).

Replace `<KillTicker kills={recentKills} />` with:
```tsx
          <KillTicker kills={mergedKills.slice(0, 10)} />
```

Add the new components in the right sidebar area (after the Activity panel):
```tsx
          <BuildingLeaderboard entries={leaderboard} isLoading={lbLoading} />
          <EcosystemStatus features={ecosystemFeatures} isLoading={ecoLoading} />
```

- [ ] **Step 3: Update breaking panel references**

The breaking variable now uses `KillEvent` type. Replace `breaking.killedAt` references with `breaking.timestamp`, and `breaking.solarSystemId` works as-is (it's `string | number`).

Replace `killToRisk(kill)` calls — the function expects `KillEntry` with `killedAt`. Update `killToRisk` to accept `KillEvent`:

```tsx
function killToRisk(kill: { timestamp?: number; killedAt?: number }): RiskLevel {
  const age = Date.now() - (kill.timestamp ?? kill.killedAt ?? 0);
  if (age < 3600000) return "CRITICAL";
  if (age < 21600000) return "HIGH";
  if (age < 86400000) return "MEDIUM";
  return "LOW";
}
```

- [ ] **Step 4: Run all frontend tests**

Run: `cd next-monorepo/app && npx vitest run --no-coverage`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/components/KillTicker.tsx next-monorepo/app/src/app/page.tsx
git commit -m "feat(eve-eyes): integrate leaderboard, ecosystem status, dual-source kills into dashboard"
```

---

### Task 9: Full Test Suite + Type Check

- [ ] **Step 1: Run backend type check + tests**

Run: `cd services && npx tsc --noEmit 2>&1 | tail -5`
Run: `cd services && npx vitest run`
Expected: No new errors, all tests pass

- [ ] **Step 2: Run frontend type check + tests**

Run: `cd next-monorepo/app && npx tsc --noEmit 2>&1 | tail -5`
Run: `cd next-monorepo/app && npx vitest run --no-coverage`
Expected: No new errors, all tests pass

- [ ] **Step 3: Fix any failures and commit**

If any failures, fix and commit with descriptive message.

---

### Task 10: Set API Key in .env

- [ ] **Step 1: Create services/.env if not exists, set API key**

```bash
# Only if .env doesn't exist — copy from example
cp services/.env.example services/.env 2>/dev/null || true
```

Then set the API key value in `services/.env`:
```
EVE_EYES_API_KEY=eve_ak_OGg2rSPof-S_13eN_kpDeIw4-rG5_q8leYZhdL2IV5w
```

**Do NOT commit .env — it contains secrets.**

- [ ] **Step 2: Verify .env is in .gitignore**

Run: `grep -q '.env' services/.gitignore && echo "OK" || echo "MISSING"`

If missing, add `.env` to `services/.gitignore`.
