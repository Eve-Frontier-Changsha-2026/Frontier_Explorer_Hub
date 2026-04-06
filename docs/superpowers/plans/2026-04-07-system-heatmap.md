# System-Based Event Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder heatmap grid with an interactive Canvas2D star-map that aggregates killmails, intel reports, gate traffic, and market activity by solar system.

**Architecture:** Backend `SystemHeatmapAggregator` queries 4 existing tables, upserts into new `heatmap_systems` table. New REST endpoint serves system nodes + links. Frontend renders via Canvas2D particle glow with d3-force layout, multi-color data labels, and click-to-inspect via existing `RegionActivityPanel`.

**Tech Stack:** TypeScript, Express, better-sqlite3, d3-force, Canvas2D, React 18, Zustand, TanStack Query

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `services/src/aggregator/system-heatmap.ts` | Aggregator: queries 4 source tables, computes intensity, upserts `heatmap_systems` |
| `services/src/api/routes/system-heatmap.ts` | REST endpoint `GET /api/heatmap/systems` |
| `services/tests/system-heatmap.test.ts` | Backend unit + monkey tests |
| `next-monorepo/app/src/lib/system-heatmap-scene.ts` | Seed systems, d3-force layout, link generation |
| `next-monorepo/app/src/components/SystemHeatmapCanvas.tsx` | Canvas2D particle renderer + HTML data label overlay |
| `next-monorepo/app/src/hooks/use-system-heatmap.ts` | React Query hook for `/api/heatmap/systems` |
| `next-monorepo/app/src/__tests__/hooks/use-system-heatmap.test.ts` | Frontend hook + filter tests |

### Modified Files
| File | Change |
|------|--------|
| `services/src/db/schema.ts` | Add `heatmap_systems` table DDL |
| `services/src/types/index.ts` | Add `SystemHeatmapNode`, `SystemHeatmapLink` types |
| `services/src/aggregator/scheduler.ts` | Call `aggregateSystemHeatmap` alongside existing pipeline |
| `services/src/api/server.ts` | Register new system-heatmap router |
| `services/src/index.ts` | No change needed (scheduler already auto-imported) |
| `next-monorepo/app/src/types/index.ts` | Add frontend `SystemNode`, `SystemLink` types |
| `next-monorepo/app/src/lib/api-client.ts` | Add `getSystemHeatmap()` function |
| `next-monorepo/app/src/stores/map-store.ts` | Add `selectedSystemId` state |
| `next-monorepo/app/src/app/map/page.tsx` | Replace placeholder grid with `SystemHeatmapCanvas` |
| `next-monorepo/app/src/components/RegionActivityPanel.tsx` | Accept optional system heatmap data |
| `next-monorepo/app/package.json` | Add `d3-force` + `@types/d3-force`, remove `@deck.gl/*` + `deck.gl` |

---

### Task 1: Database Schema — `heatmap_systems` Table

**Files:**
- Modify: `services/src/db/schema.ts:239-245` (before closing backtick)
- Modify: `services/src/types/index.ts` (append new types)

- [ ] **Step 1: Add `heatmap_systems` DDL to schema.ts**

In `services/src/db/schema.ts`, add before the closing `` `); `` on line 245:

```sql
    -- ── System-based heatmap ───────────────────────────────────────

    CREATE TABLE IF NOT EXISTS heatmap_systems (
      system_id        TEXT PRIMARY KEY,
      system_name      TEXT NOT NULL,
      kill_count       INTEGER NOT NULL DEFAULT 0,
      intel_count      INTEGER NOT NULL DEFAULT 0,
      gate_traffic     INTEGER NOT NULL DEFAULT 0,
      market_activity  INTEGER NOT NULL DEFAULT 0,
      intensity        REAL NOT NULL DEFAULT 0,
      latest_event_at  INTEGER NOT NULL DEFAULT 0,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_heatmap_systems_intensity
      ON heatmap_systems(intensity);
```

- [ ] **Step 2: Add backend types to `services/src/types/index.ts`**

Append at end of file:

```typescript
// ── System Heatmap types ────────────────────────────────────────

export interface SystemHeatmapNode {
  systemId: string;
  systemName: string;
  killCount: number;
  intelCount: number;
  gateTraffic: number;
  marketActivity: number;
  intensity: number;
  latestEventAt: number;
  updatedAt: number;
}

export interface SystemHeatmapLink {
  from: string;
  to: string;
}

export interface SystemHeatmapResponse {
  systems: SystemHeatmapNode[];
  links: SystemHeatmapLink[];
  generatedAt: string;
}
```

- [ ] **Step 3: Verify schema loads**

Run: `cd services && npx tsx -e "import { getDb } from './src/db/client.js'; const db = getDb(':memory:'); console.log('OK'); db.close();"`

Expected: `OK` with no errors

- [ ] **Step 4: Commit**

```bash
git add services/src/db/schema.ts services/src/types/index.ts
git commit -m "feat: add heatmap_systems table schema and types"
```

---

### Task 2: Backend Aggregator — `SystemHeatmapAggregator`

**Files:**
- Create: `services/src/aggregator/system-heatmap.ts`
- Modify: `services/src/aggregator/scheduler.ts`

- [ ] **Step 1: Write test file `services/tests/system-heatmap.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { getTestDb } from '../src/db/client.js';
import { aggregateSystemHeatmap } from '../src/aggregator/system-heatmap.js';

function insertKillmail(db: Database.Database, opts: { id: string; solarSystemId: number; killedAt?: number }) {
  db.prepare(
    `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
     VALUES (?, 'k1', 'killer', 'v1', 'victim', 'r1', 'reporter', 'SHIP', ?, ?, 1, ?)`
  ).run(opts.id, opts.solarSystemId, opts.killedAt ?? Date.now(), Date.now());
}

function insertIntel(db: Database.Database, opts: { intelId: string; regionId: number; severity?: number; timestamp?: number; expiry?: number }) {
  db.prepare(
    `INSERT INTO intel_reports (intel_id, reporter, region_id, sector_x, sector_y, sector_z, zoom_level, intel_type, severity, timestamp, expiry)
     VALUES (?, 'rep1', ?, 0, 0, 0, 0, 0, ?, ?, ?)`
  ).run(opts.intelId, opts.regionId, opts.severity ?? 5, opts.timestamp ?? Date.now(), opts.expiry ?? Date.now() + 3_600_000);
}

function getSystem(db: Database.Database, systemId: string) {
  return db.prepare('SELECT * FROM heatmap_systems WHERE system_id = ?').get(systemId) as {
    system_id: string; system_name: string; kill_count: number; intel_count: number;
    gate_traffic: number; market_activity: number; intensity: number;
  } | undefined;
}

describe('SystemHeatmapAggregator', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('aggregates killmails by solar_system_id', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k3', solarSystemId: 30004452 });

    aggregateSystemHeatmap(db);

    const sys1 = getSystem(db, '30001719');
    expect(sys1).toBeDefined();
    expect(sys1!.kill_count).toBe(2);
    expect(sys1!.system_name).toBe('ONT-MT7');

    const sys2 = getSystem(db, '30004452');
    expect(sys2).toBeDefined();
    expect(sys2!.kill_count).toBe(1);
    expect(sys2!.system_name).toBe('IN3-K3D');
  });

  it('aggregates intel reports by region_id', () => {
    insertIntel(db, { intelId: 'i1', regionId: 30001719 });
    insertIntel(db, { intelId: 'i2', regionId: 30001719 });

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.intel_count).toBe(2);
  });

  it('computes intensity = min(100, kills*20 + intel*15 + gates*5 + market*3)', () => {
    // 3 kills = 60, 2 intel = 30 → total = 90
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k3', solarSystemId: 30001719 });
    insertIntel(db, { intelId: 'i1', regionId: 30001719 });
    insertIntel(db, { intelId: 'i2', regionId: 30001719 });

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.intensity).toBe(90);
  });

  it('caps intensity at 100', () => {
    // 6 kills = 120 → capped at 100
    for (let i = 0; i < 6; i++) {
      insertKillmail(db, { id: `k${i}`, solarSystemId: 30001719 });
    }

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.intensity).toBe(100);
  });

  it('assigns placeholder name for unknown system', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 99999999 });

    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '99999999');
    expect(sys!.system_name).toBe('SYS-999999');
  });

  it('upserts on repeated runs (idempotent)', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);

    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.kill_count).toBe(2);
  });

  it('returns empty result for empty tables', () => {
    aggregateSystemHeatmap(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM heatmap_systems').get() as { c: number };
    expect(count.c).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services && npx vitest run tests/system-heatmap.test.ts`

Expected: FAIL — `aggregateSystemHeatmap` not found

- [ ] **Step 3: Implement `services/src/aggregator/system-heatmap.ts`**

```typescript
import type Database from 'better-sqlite3';

// Seed systems from frontier-trade-routes (known EVE Frontier solar systems)
const SEED_NAMES: Record<string, string> = {
  '30001719': 'ONT-MT7',
  '30004452': 'IN3-K3D',
  '30004448': 'EH1-FQC',
  '30004453': 'ULV-77D',
  '30004449': 'U1S-HBD',
  '30004451': 'E27-HSD',
  '30004455': 'E5V-0BD',
  '30004454': 'O3V-49D',
  '30004450': 'OBQ-6JD',
  '30000007': 'UR7-5FN',
  '30000006': 'OFC-3FN',
  '30000005': 'I9T-0FN',
  '30000004': 'O3H-1FN',
};

function systemName(id: string): string {
  return SEED_NAMES[id] ?? `SYS-${id.slice(-6)}`;
}

interface SystemBucket {
  killCount: number;
  intelCount: number;
  gateTraffic: number;
  marketActivity: number;
  latestEventAt: number;
}

export function aggregateSystemHeatmap(db: Database.Database): void {
  const now = Date.now();
  const buckets = new Map<string, SystemBucket>();

  function getBucket(id: string): SystemBucket {
    let b = buckets.get(id);
    if (!b) {
      b = { killCount: 0, intelCount: 0, gateTraffic: 0, marketActivity: 0, latestEventAt: 0 };
      buckets.set(id, b);
    }
    return b;
  }

  // 1. Killmails
  const kills = db.prepare(
    'SELECT solar_system_id, COUNT(*) as cnt, MAX(killed_at) as latest FROM utopia_killmails GROUP BY solar_system_id'
  ).all() as Array<{ solar_system_id: number; cnt: number; latest: number }>;

  for (const row of kills) {
    const b = getBucket(String(row.solar_system_id));
    b.killCount = row.cnt;
    b.latestEventAt = Math.max(b.latestEventAt, row.latest);
  }

  // 2. Intel reports (non-expired)
  const intel = db.prepare(
    'SELECT region_id, COUNT(*) as cnt, MAX(timestamp) as latest FROM intel_reports WHERE expiry > ? GROUP BY region_id'
  ).all(now) as Array<{ region_id: number; cnt: number; latest: number }>;

  for (const row of intel) {
    const b = getBucket(String(row.region_id));
    b.intelCount = row.cnt;
    b.latestEventAt = Math.max(b.latestEventAt, row.latest);
  }

  // 3. Gate traffic (from region_activity — traffic_index as proxy)
  const gateActivity = db.prepare(
    'SELECT region_id, traffic_index, window_end FROM region_activity WHERE region_id IS NOT NULL ORDER BY window_end DESC'
  ).all() as Array<{ region_id: number; traffic_index: number; window_end: number }>;

  const seenGateRegions = new Set<number>();
  for (const row of gateActivity) {
    if (seenGateRegions.has(row.region_id)) continue;
    seenGateRegions.add(row.region_id);
    const b = getBucket(String(row.region_id));
    b.gateTraffic = Math.round(row.traffic_index);
    b.latestEventAt = Math.max(b.latestEventAt, row.window_end);
  }

  // 4. Market activity (bounties as proxy)
  const market = db.prepare(
    'SELECT region_id, COUNT(*) as cnt, MAX(updated_at) as latest FROM bounties GROUP BY region_id'
  ).all() as Array<{ region_id: number; cnt: number; latest: number }>;

  for (const row of market) {
    const b = getBucket(String(row.region_id));
    b.marketActivity = row.cnt;
    b.latestEventAt = Math.max(b.latestEventAt, row.latest);
  }

  // Upsert all
  const upsert = db.prepare(`
    INSERT INTO heatmap_systems (system_id, system_name, kill_count, intel_count, gate_traffic, market_activity, intensity, latest_event_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(system_id) DO UPDATE SET
      system_name = excluded.system_name,
      kill_count = excluded.kill_count,
      intel_count = excluded.intel_count,
      gate_traffic = excluded.gate_traffic,
      market_activity = excluded.market_activity,
      intensity = excluded.intensity,
      latest_event_at = excluded.latest_event_at,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const [id, b] of buckets) {
      const intensity = Math.min(100, b.killCount * 20 + b.intelCount * 15 + b.gateTraffic * 5 + b.marketActivity * 3);
      upsert.run(id, systemName(id), b.killCount, b.intelCount, b.gateTraffic, b.marketActivity, intensity, b.latestEventAt, now);
    }
  });

  tx();
}
```

- [ ] **Step 4: Run tests**

Run: `cd services && npx vitest run tests/system-heatmap.test.ts`

Expected: All 7 tests PASS

- [ ] **Step 5: Hook aggregator into scheduler**

In `services/src/aggregator/scheduler.ts`, add import and call:

```typescript
import type Database from 'better-sqlite3';
import { aggregateHeatmap } from './pipeline.js';
import { aggregateSystemHeatmap } from './system-heatmap.js';

// ... (existing SchedulerConfig and class unchanged)

  runOnce(): void {
    try {
      aggregateHeatmap(this.db, this.config.kAnonymityThreshold);
      aggregateSystemHeatmap(this.db);
    } catch (err) {
      console.error('[AggregationScheduler] pipeline error:', err);
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add services/src/aggregator/system-heatmap.ts services/src/aggregator/scheduler.ts services/tests/system-heatmap.test.ts
git commit -m "feat: system heatmap aggregator with 7 unit tests"
```

---

### Task 3: Backend API Endpoint

**Files:**
- Create: `services/src/api/routes/system-heatmap.ts`
- Modify: `services/src/api/server.ts:7-47`

- [ ] **Step 1: Add test cases to `services/tests/system-heatmap.test.ts`**

Append to the existing test file:

```typescript
import { createApp } from '../src/api/server.js';
import request from 'supertest';

describe('GET /api/heatmap/systems', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('returns empty systems when no data', async () => {
    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.status).toBe(200);
    expect(res.body.systems).toEqual([]);
    expect(res.body.links).toEqual([]);
    expect(res.body.generatedAt).toBeDefined();
  });

  it('returns aggregated systems after pipeline run', async () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    insertKillmail(db, { id: 'k2', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);

    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.status).toBe(200);
    expect(res.body.systems).toHaveLength(1);
    expect(res.body.systems[0].systemId).toBe('30001719');
    expect(res.body.systems[0].systemName).toBe('ONT-MT7');
    expect(res.body.systems[0].killCount).toBe(2);
    expect(res.body.systems[0].intensity).toBe(40);
  });

  it('generates links between systems with shared killmail actors', async () => {
    // Two systems, same killer → generates a link
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES ('k1', 'killer_A', 'K', 'v1', 'V', 'r1', 'R', 'SHIP', 30001719, ?, 1, ?)`
    ).run(Date.now(), Date.now());
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES ('k2', 'killer_A', 'K', 'v2', 'V', 'r1', 'R', 'SHIP', 30004452, ?, 1, ?)`
    ).run(Date.now(), Date.now());
    aggregateSystemHeatmap(db);

    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.body.links.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services && npx vitest run tests/system-heatmap.test.ts`

Expected: FAIL — router not registered

- [ ] **Step 3: Create `services/src/api/routes/system-heatmap.ts`**

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { SystemHeatmapNode, SystemHeatmapLink } from '../../types/index.js';

function getSystemNodes(db: Database.Database): SystemHeatmapNode[] {
  const rows = db.prepare(
    'SELECT * FROM heatmap_systems ORDER BY intensity DESC'
  ).all() as Array<{
    system_id: string; system_name: string; kill_count: number; intel_count: number;
    gate_traffic: number; market_activity: number; intensity: number;
    latest_event_at: number; updated_at: number;
  }>;

  return rows.map((r) => ({
    systemId: r.system_id,
    systemName: r.system_name,
    killCount: r.kill_count,
    intelCount: r.intel_count,
    gateTraffic: r.gate_traffic,
    marketActivity: r.market_activity,
    intensity: r.intensity,
    latestEventAt: r.latest_event_at,
    updatedAt: r.updated_at,
  }));
}

function getSystemLinks(db: Database.Database): SystemHeatmapLink[] {
  // Link systems that share the same killer (players who move between systems)
  const rows = db.prepare(`
    SELECT DISTINCT a.solar_system_id AS sys_a, b.solar_system_id AS sys_b
    FROM utopia_killmails a
    JOIN utopia_killmails b ON a.killer_id = b.killer_id AND a.solar_system_id < b.solar_system_id
    LIMIT 100
  `).all() as Array<{ sys_a: number; sys_b: number }>;

  return rows.map((r) => ({
    from: String(r.sys_a),
    to: String(r.sys_b),
  }));
}

export function createSystemHeatmapRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/heatmap/systems', (_req, res) => {
    const systems = getSystemNodes(db);
    const links = getSystemLinks(db);

    res.json({
      systems,
      links,
      generatedAt: new Date().toISOString(),
    });
  });

  return router;
}
```

- [ ] **Step 4: Register router in `services/src/api/server.ts`**

Add import at line 13 (after other router imports):

```typescript
import { createSystemHeatmapRouter } from './routes/system-heatmap.js';
```

Add route registration after line 46 (`app.use('/api', createRegionRouter(db));`):

```typescript
  app.use('/api', createSystemHeatmapRouter(db));
```

- [ ] **Step 5: Run tests**

Run: `cd services && npx vitest run tests/system-heatmap.test.ts`

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add services/src/api/routes/system-heatmap.ts services/src/api/server.ts services/tests/system-heatmap.test.ts
git commit -m "feat: GET /api/heatmap/systems endpoint with link generation"
```

---

### Task 4: Monkey Tests — Backend

**Files:**
- Modify: `services/tests/system-heatmap.test.ts` (append)

- [ ] **Step 1: Add monkey tests**

Append to `services/tests/system-heatmap.test.ts`:

```typescript
describe('SystemHeatmap — Monkey Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  it('handles MAX_SAFE_INTEGER solar_system_id gracefully', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: Number.MAX_SAFE_INTEGER });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, String(Number.MAX_SAFE_INTEGER));
    expect(sys).toBeDefined();
    expect(sys!.kill_count).toBe(1);
  });

  it('handles 0 as solar_system_id', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 0 });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '0');
    expect(sys!.system_name).toBe('SYS-000000');
  });

  it('handles negative solar_system_id', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: -1 });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '-1');
    expect(sys).toBeDefined();
  });

  it('handles thousands of killmails without error', () => {
    const insert = db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, 'k', 'K', 'v', 'V', 'r', 'R', 'SHIP', ?, ?, 1, ?)`
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < 5000; i++) {
        insert.run(`k${i}`, 30001719, Date.now(), Date.now());
      }
    });
    tx();

    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '30001719');
    expect(sys!.kill_count).toBe(5000);
    expect(sys!.intensity).toBe(100); // capped
  });

  it('expired intel reports are excluded from aggregation', () => {
    insertIntel(db, { intelId: 'i1', regionId: 30001719, expiry: Date.now() - 1000 });
    aggregateSystemHeatmap(db);
    const sys = getSystem(db, '30001719');
    expect(sys).toBeUndefined(); // expired → not counted
  });

  it('concurrent aggregation runs produce consistent results', () => {
    insertKillmail(db, { id: 'k1', solarSystemId: 30001719 });
    aggregateSystemHeatmap(db);
    aggregateSystemHeatmap(db);
    aggregateSystemHeatmap(db);

    const sys = getSystem(db, '30001719');
    expect(sys!.kill_count).toBe(1);
    expect(sys!.intensity).toBe(20);
  });

  it('API returns valid JSON for empty database', async () => {
    const app = createApp({ db });
    const res = await request(app).get('/api/heatmap/systems');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.systems)).toBe(true);
    expect(Array.isArray(res.body.links)).toBe(true);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd services && npx vitest run tests/system-heatmap.test.ts`

Expected: All tests PASS (14+ tests)

- [ ] **Step 3: Commit**

```bash
git add services/tests/system-heatmap.test.ts
git commit -m "test: add monkey tests for system heatmap aggregator"
```

---

### Task 5: Frontend Dependencies & Types

**Files:**
- Modify: `next-monorepo/app/package.json`
- Modify: `next-monorepo/app/src/types/index.ts`
- Modify: `next-monorepo/app/src/lib/api-client.ts`

- [ ] **Step 1: Install d3-force, remove deck.gl**

```bash
cd next-monorepo/app && pnpm add d3-force && pnpm add -D @types/d3-force && pnpm remove @deck.gl/core @deck.gl/layers deck.gl
```

- [ ] **Step 2: Add frontend types to `next-monorepo/app/src/types/index.ts`**

Append at end of file:

```typescript
// ── System Heatmap ──────────────────────────────────────────────

export interface SystemNode {
  systemId: string;
  systemName: string;
  killCount: number;
  intelCount: number;
  gateTraffic: number;
  marketActivity: number;
  intensity: number;
  latestEventAt: number;
}

export interface SystemLink {
  from: string;
  to: string;
}

export interface SystemHeatmapData {
  systems: SystemNode[];
  links: SystemLink[];
  generatedAt: string;
}
```

- [ ] **Step 3: Add API client function to `next-monorepo/app/src/lib/api-client.ts`**

Add import of `SystemHeatmapData` to the existing import line, then append function:

```typescript
export async function getSystemHeatmap(): Promise<SystemHeatmapData> {
  return apiFetch<SystemHeatmapData>("/heatmap/systems");
}
```

- [ ] **Step 4: Add `selectedSystemId` to map store**

In `next-monorepo/app/src/stores/map-store.ts`, add to `MapState` interface:

```typescript
  selectedSystemId: string | null;
  selectSystem: (id: string | null) => void;
```

And in the `create` body:

```typescript
  selectedSystemId: null,
  selectSystem: (id) => set({ selectedSystemId: id }),
```

- [ ] **Step 5: Run typecheck**

Run: `cd next-monorepo/app && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/package.json next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/api-client.ts next-monorepo/app/src/stores/map-store.ts
cd ../.. && git add next-monorepo/app/pnpm-lock.yaml 2>/dev/null; true
git commit -m "feat: add system heatmap frontend types, API client, and map store"
```

---

### Task 6: Scene Layout — d3-force + Seed Systems

**Files:**
- Create: `next-monorepo/app/src/lib/system-heatmap-scene.ts`

- [ ] **Step 1: Create scene module**

```typescript
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import type { SystemNode, SystemLink } from "@/types";

export interface SceneNode extends SimulationNodeDatum {
  id: string;
  label: string;
  intensity: number;
  killCount: number;
  intelCount: number;
  gateTraffic: number;
  marketActivity: number;
  latestEventAt: number;
}

export interface SceneLink extends SimulationLinkDatum<SceneNode> {
  source: string;
  target: string;
}

export const SCENE_SIZE = { width: 1600, height: 1040 };

// Seed positions (hand-tuned, from frontier-trade-routes)
const SEED_POSITIONS: Record<string, { x: number; y: number }> = {
  "30001719": { x: 236, y: 840 },
  "30004452": { x: 372, y: 472 },
  "30004448": { x: 448, y: 420 },
  "30004453": { x: 548, y: 454 },
  "30004449": { x: 594, y: 372 },
  "30004451": { x: 650, y: 304 },
  "30004455": { x: 680, y: 452 },
  "30004454": { x: 756, y: 484 },
  "30004450": { x: 818, y: 388 },
  "30000007": { x: 1016, y: 286 },
  "30000006": { x: 1124, y: 248 },
  "30000005": { x: 1266, y: 214 },
  "30000004": { x: 1384, y: 178 },
};

function hashPosition(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const x = 100 + ((hash >>> 0) % (SCENE_SIZE.width - 200));
  const y = 100 + ((hash >>> 16) % (SCENE_SIZE.height - 200));
  return { x, y };
}

export function buildScene(systems: SystemNode[], links: SystemLink[]): { nodes: SceneNode[]; links: SceneLink[] } {
  const nodes: SceneNode[] = systems.map((s) => {
    const seed = SEED_POSITIONS[s.systemId];
    const pos = seed ?? hashPosition(s.systemId);
    return {
      id: s.systemId,
      label: s.systemName,
      intensity: s.intensity,
      killCount: s.killCount,
      intelCount: s.intelCount,
      gateTraffic: s.gateTraffic,
      marketActivity: s.marketActivity,
      latestEventAt: s.latestEventAt,
      x: pos.x,
      y: pos.y,
      // Pin seed nodes initially
      ...(seed ? { fx: pos.x, fy: pos.y } : {}),
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const sceneLinks: SceneLink[] = links
    .filter((l) => nodeIds.has(l.from) && nodeIds.has(l.to))
    .map((l) => ({ source: l.from, target: l.to }));

  // Add nearest-neighbor links for isolated nodes
  const linked = new Set<string>();
  for (const l of sceneLinks) {
    linked.add(`${l.source}::${l.target}`);
    linked.add(`${l.target}::${l.source}`);
  }

  for (const node of nodes) {
    const neighbors = nodes
      .filter((n) => n.id !== node.id && !linked.has(`${node.id}::${n.id}`))
      .map((n) => ({ n, d: Math.hypot((node.x ?? 0) - (n.x ?? 0), (node.y ?? 0) - (n.y ?? 0)) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .filter(({ d }) => d < 340);

    for (const { n } of neighbors) {
      const key = [node.id, n.id].sort().join("::");
      if (!linked.has(key)) {
        linked.add(key);
        linked.add(key.split("::").reverse().join("::"));
        sceneLinks.push({ source: node.id, target: n.id });
      }
    }
  }

  // Run simulation
  const sim = forceSimulation(nodes)
    .force("link", forceLink(sceneLinks).id((d) => (d as SceneNode).id).distance(120).strength(0.3))
    .force("charge", forceManyBody().strength(-200))
    .force("center", forceCenter(SCENE_SIZE.width / 2, SCENE_SIZE.height / 2).strength(0.05))
    .force("collide", forceCollide(40))
    .stop();

  // Run 120 ticks then release pinned nodes
  for (let i = 0; i < 120; i++) sim.tick();
  for (const node of nodes) {
    delete node.fx;
    delete node.fy;
  }

  return { nodes, links: sceneLinks };
}

// ── Background stars ─────────────────────────────────────────────

export interface BackgroundStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export function buildBackgroundStars(nodes: SceneNode[]): BackgroundStar[] {
  let seed = 30001719;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const stars: BackgroundStar[] = [];
  for (let i = 0; i < 620; i++) {
    stars.push({
      x: Math.round(random() * SCENE_SIZE.width),
      y: Math.round(random() * SCENE_SIZE.height),
      size: 0.35 + random() * 1.7,
      alpha: 0.12 + random() * 0.42,
    });
  }

  for (const node of nodes) {
    for (let i = 0; i < 22; i++) {
      const angle = random() * Math.PI * 2;
      const spread = 12 + random() * 84;
      stars.push({
        x: Math.round((node.x ?? 0) + Math.cos(angle) * spread),
        y: Math.round((node.y ?? 0) + Math.sin(angle) * spread),
        size: 0.4 + random() * 1.8,
        alpha: 0.16 + random() * 0.36,
      });
    }
  }

  return stars.filter(
    (s) => s.x >= 0 && s.x <= SCENE_SIZE.width && s.y >= 0 && s.y <= SCENE_SIZE.height
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd next-monorepo/app && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/lib/system-heatmap-scene.ts
git commit -m "feat: d3-force scene layout with seed positions and background stars"
```

---

### Task 7: React Query Hook — `useSystemHeatmap`

**Files:**
- Create: `next-monorepo/app/src/hooks/use-system-heatmap.ts`

- [ ] **Step 1: Create hook**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { getSystemHeatmap } from "@/lib/api-client";
import { useMemo } from "react";
import { buildScene, buildBackgroundStars, type SceneNode, type SceneLink, type BackgroundStar } from "@/lib/system-heatmap-scene";

export function useSystemHeatmap() {
  const query = useQuery({
    queryKey: ["systemHeatmap"],
    queryFn: getSystemHeatmap,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const scene = useMemo(() => {
    if (!query.data) return null;
    return buildScene(query.data.systems, query.data.links);
  }, [query.data]);

  const stars = useMemo(() => {
    if (!scene) return [];
    return buildBackgroundStars(scene.nodes);
  }, [scene]);

  return {
    nodes: scene?.nodes ?? [],
    links: scene?.links ?? [],
    stars,
    isLoading: query.isLoading,
    isError: query.isError,
    generatedAt: query.data?.generatedAt ?? null,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd next-monorepo/app && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/hooks/use-system-heatmap.ts
git commit -m "feat: useSystemHeatmap hook with d3-force scene memoization"
```

---

### Task 8: Canvas Renderer — `SystemHeatmapCanvas`

**Files:**
- Create: `next-monorepo/app/src/components/SystemHeatmapCanvas.tsx`

- [ ] **Step 1: Create canvas component**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSystemHeatmap } from "@/hooks/use-system-heatmap";
import { useMapStore } from "@/stores/map-store";
import { SCENE_SIZE, type SceneNode, type SceneLink, type BackgroundStar } from "@/lib/system-heatmap-scene";

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
  const selectSystem = useMapStore((s) => s.selectSystem);
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
      className="relative w-full min-h-[500px] overflow-hidden cursor-grab active:cursor-grabbing select-none"
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
                selectSystem(node.id);
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
```

- [ ] **Step 2: Run typecheck**

Run: `cd next-monorepo/app && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/components/SystemHeatmapCanvas.tsx
git commit -m "feat: Canvas2D system heatmap renderer with particle glow and data labels"
```

---

### Task 9: Map Page Integration

**Files:**
- Modify: `next-monorepo/app/src/app/map/page.tsx`
- Modify: `next-monorepo/app/src/components/RegionActivityPanel.tsx`

- [ ] **Step 1: Replace placeholder grid in map page**

Replace the entire heatmap tab content (lines 104-130) in `next-monorepo/app/src/app/map/page.tsx`:

Replace:
```tsx
              <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1 min-h-[400px] bg-eve-stars relative">
                {isLoading ? (
                  <p className="text-[0.73rem] text-eve-muted p-4">Loading heatmap data...</p>
                ) : cells.length === 0 ? (
                  <p className="text-[0.73rem] text-eve-muted p-4">No heatmap data available. Submit intel to populate.</p>
                ) : (
                  <div className="p-4">
                    <p className="text-[0.73rem] text-eve-muted mb-2">
                      deck.gl HeatmapLayer renders here. {cells.length} cells loaded at zoom {effectiveZoom}.
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {cells.slice(0, 12).map((cell, i) => (
                        <div
                          key={i}
                          className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.6)] p-1.5 text-[0.6rem] text-eve-muted cursor-pointer hover:border-eve-glow"
                          onClick={() => setSelected(`${cell.cell.regionId}-${i}`)}
                        >
                          <strong className="text-eve-cold block">R-{cell.cell.regionId}</strong>
                          <span>{cell.totalReports} reports</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
```

With:
```tsx
              <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-0 min-h-[500px] relative">
                <SystemHeatmapCanvas />
              </div>
```

- [ ] **Step 2: Add import**

At top of `map/page.tsx`, add:

```typescript
import { SystemHeatmapCanvas } from "@/components/SystemHeatmapCanvas";
```

- [ ] **Step 3: Update RegionActivityPanel to show system heatmap data**

In `RegionActivityPanel.tsx`, update the `RegionActivityPanelProps` to accept optional system data and display it:

After the existing heatmap section (line 76-80), add a system heatmap section:

```tsx
          {/* System heatmap breakdown (when selected via star map) */}
          {heatmap && (heatmap as any).killCount !== undefined && (
            <div className="flex gap-3 text-[0.6rem] border-t border-eve-panel-border/20 pt-1.5 mt-0.5 flex-wrap">
              <span style={{ color: "#f87171" }}>⚔ {(heatmap as any).killCount} kills</span>
              <span style={{ color: "#22d3ee" }}>📡 {(heatmap as any).intelCount} intel</span>
              <span style={{ color: "#a78bfa" }}>🚪 {(heatmap as any).gateTraffic} gates</span>
              <span style={{ color: "#fbbf24" }}>💰 {(heatmap as any).marketActivity} market</span>
            </div>
          )}
```

- [ ] **Step 4: Update sidebar Selected Intel panel to show system name**

In `map/page.tsx`, update the selected panel section (line 136-140) to use `selectedSystemId` from store:

Replace:
```tsx
          <Panel title="Selected Intel" badge={selected ?? "none"}>
            <p className="mt-2 text-[0.73rem] text-eve-muted/80">
              {selected ? `Viewing cell ${selected}` : "Click a cell or feed item to inspect."}
            </p>
          </Panel>
```

With:
```tsx
          <Panel title="Selected System" badge={selectedSystemId ?? "none"}>
            <p className="mt-2 text-[0.73rem] text-eve-muted/80">
              {selectedSystemId ? `Viewing system ${selectedSystemId}` : "Click a system node to inspect."}
            </p>
          </Panel>
```

And add to the component's destructuring:

```typescript
const selectedSystemId = useMapStore((s) => s.selectedSystemId);
```

- [ ] **Step 5: Run typecheck**

Run: `cd next-monorepo/app && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/app/map/page.tsx next-monorepo/app/src/components/RegionActivityPanel.tsx
git commit -m "feat: integrate SystemHeatmapCanvas into map page, replace placeholder grid"
```

---

### Task 10: Frontend Tests

**Files:**
- Create: `next-monorepo/app/src/__tests__/hooks/use-system-heatmap.test.ts`

- [ ] **Step 1: Write hook and scene tests**

```typescript
import { describe, it, expect } from "vitest";
import { buildScene, buildBackgroundStars, SCENE_SIZE } from "@/lib/system-heatmap-scene";
import type { SystemNode, SystemLink } from "@/types";

function makeNode(id: string, intensity = 50): SystemNode {
  return {
    systemId: id,
    systemName: `SYS-${id}`,
    killCount: 1,
    intelCount: 1,
    gateTraffic: 0,
    marketActivity: 0,
    intensity,
    latestEventAt: Date.now(),
  };
}

describe("buildScene", () => {
  it("positions seed systems at predefined coordinates", () => {
    const nodes = [makeNode("30001719", 50)];
    const result = buildScene(nodes, []);
    const node = result.nodes.find((n) => n.id === "30001719");
    expect(node).toBeDefined();
    // After simulation, should be near seed position (236, 840) but may drift
    expect(node!.x).toBeGreaterThan(0);
    expect(node!.y).toBeGreaterThan(0);
  });

  it("uses hash position for unknown system", () => {
    const nodes = [makeNode("99999999", 30)];
    const result = buildScene(nodes, []);
    expect(result.nodes[0].x).toBeGreaterThanOrEqual(100);
    expect(result.nodes[0].x).toBeLessThanOrEqual(SCENE_SIZE.width - 100);
  });

  it("generates nearest-neighbor links for isolated nodes", () => {
    const nodes = [makeNode("30001719"), makeNode("30004452")];
    const result = buildScene(nodes, []);
    expect(result.links.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty input", () => {
    const result = buildScene([], []);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("handles single node", () => {
    const result = buildScene([makeNode("30001719")], []);
    expect(result.nodes).toHaveLength(1);
    expect(result.links).toHaveLength(0);
  });
});

describe("buildBackgroundStars", () => {
  it("generates ~620+ stars", () => {
    const nodes = [{ id: "test", x: 400, y: 400 } as any];
    const stars = buildBackgroundStars(nodes);
    expect(stars.length).toBeGreaterThan(600);
  });

  it("all stars within scene bounds", () => {
    const stars = buildBackgroundStars([]);
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(SCENE_SIZE.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(SCENE_SIZE.height);
    }
  });

  it("is deterministic (same output for same input)", () => {
    const a = buildBackgroundStars([]);
    const b = buildBackgroundStars([]);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-system-heatmap.test.ts`

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/__tests__/hooks/use-system-heatmap.test.ts
git commit -m "test: scene layout and background stars tests"
```

---

### Task 11: Full Typecheck + Manual Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Backend typecheck**

Run: `cd services && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 2: Frontend typecheck**

Run: `cd next-monorepo/app && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Run all backend tests**

Run: `cd services && npx vitest run`

Expected: All tests PASS

- [ ] **Step 4: Run all frontend tests**

Run: `cd next-monorepo/app && npx vitest run`

Expected: All tests PASS

- [ ] **Step 5: Smoke test (manual)**

Start both servers:
```bash
cd services && npx tsx watch src/index.ts &
cd next-monorepo/app && pnpm dev &
```

Open http://localhost:3000/map → click "Intel Heatmap" tab → verify:
1. Canvas renders with stars and particle glows (if there's data)
2. System names appear as labels
3. Data labels show in correct colors (red/cyan/purple/yellow)
4. Pan (drag) and zoom (scroll) work
5. Click a system node → sidebar panel updates

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address smoke test findings"
```
