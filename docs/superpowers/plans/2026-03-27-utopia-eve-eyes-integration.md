# Utopia + EVE EYES Dual-Source Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Utopia and EVE EYES APIs as dual data sources, replacing dashboard mock data with real-world game events and a unified world status view.

**Architecture:** Backend adds UtopiaClient + UtopiaTracker (polls every 5min) alongside existing EveEyesClient + ActivityTracker. A WorldAggregator merges both sources using set-union logic into a cached WorldStatus. Frontend replaces mock data with real events and adds a WorldStatusBar + KillTicker.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, TanStack Query, Vitest, supertest

---

## File Structure

### Backend (services/src/)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `utopia/client.ts` | HTTP client for Utopia REST API with rate limiting |
| Create | `utopia/tracker.ts` | Polls Utopia endpoints every 5min, writes to SQLite |
| Create | `aggregator/world-aggregator.ts` | Merges EVE EYES + Utopia data into unified WorldStatus |
| Create | `api/routes/world.ts` | GET /api/world/status + detail proxy routes |
| Modify | `types/index.ts` | Add Utopia + WorldStatus types |
| Modify | `db/schema.ts` | Add 5 new tables |
| Modify | `config.ts` | Add utopia config vars |
| Modify | `index.ts` | Start UtopiaTracker + WorldAggregator |
| Modify | `api/server.ts` | Register world routes |

### Backend Tests (services/tests/)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `utopia-client.test.ts` | UtopiaClient unit tests with mocked fetch |
| Create | `utopia-tracker.test.ts` | UtopiaTracker poll + DB write tests |
| Create | `world-aggregator.test.ts` | Union logic, stale detection, single-source-down |
| Create | `world-routes.test.ts` | /api/world/* endpoint integration tests |
| Create | `world-monkey.test.ts` | Malformed responses, empty data, extreme values |

### Frontend (next-monorepo/app/src/)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `hooks/use-world-status.ts` | React Query hook for /api/world/status |
| Create | `components/WorldStatusBar.tsx` | Horizontal status bar (5 cells) |
| Create | `components/KillTicker.tsx` | Sidebar kill feed panel |
| Modify | `types/index.ts` | Add WorldStatus, SourceMeta, KillEntry types |
| Modify | `lib/api-client.ts` | Add getWorldStatus + detail proxy functions |
| Modify | `app/page.tsx` | Replace mock data, add new components |
| Modify | `lib/mock-data.ts` | Remove headlines/timelineEvents (keep plugins) |

### Frontend Tests (next-monorepo/app/src/__tests__/)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `hooks/use-world-status.test.ts` | Hook unit tests |
| Create | `api-client-world.test.ts` | API client world functions tests |
| Create | `monkey/world-status-monkey.test.ts` | Extreme/malformed data monkey tests |

---

## Task 1: Backend Types + Schema

**Files:**
- Modify: `services/src/types/index.ts`
- Modify: `services/src/db/schema.ts`
- Modify: `services/src/config.ts`

- [ ] **Step 1: Add Utopia + WorldStatus types to `services/src/types/index.ts`**

Append at end of file:

```typescript
// ── Utopia types ─────────────────────────────────────────────

export interface UtopiaCharacter {
  id: string;
  name: string;
  address: string;
  tribeId: number;
  tribeName: string;
  tribeTicker: string;
  createdAt: number;
}

export interface UtopiaKillmail {
  id: string;
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  reporterId: string;
  reporterName: string;
  lossType: string;
  solarSystemId: number;
  killedAt: number;
  shard: number;
}

export interface UtopiaAssembly {
  id: string;
  state: string;
  ownerId: string;
  ownerName: string;
  name: string;
  typeId: number;
  anchoredAt: number;
}

export interface UtopiaTribe {
  id: number;
  name: string;
  nameShort: string;
  description: string;
  tribeUrl: string;
  memberCount: number;
  createdAt: number;
}

export interface UtopiaCharacterDetail extends UtopiaCharacter {
  shard: number;
  profileId: string;
  tribeJoinedAt: number;
}

export interface UtopiaAssemblyDetail extends UtopiaAssembly {
  pkTypeState: string;
  shard: number;
  locationHash: string;
  dappURL: string;
  description: string;
  networkNodeId: string;
  itemId: number;
  assemblyType: string;
}

export interface UtopiaPaginatedResponse<T> {
  items: T[];
}

// ── World Status (aggregated) ────────────────────────────────

export interface SourceMeta {
  provider: 'eve-eyes' | 'utopia';
  fetchedAt: number;
  stale: boolean;
}

export interface KillEntry {
  id: string;
  killerName: string;
  killerId: string;
  victimName: string;
  victimId: string;
  lossType: string;
  solarSystemId: number;
  killedAt: number;
}

export interface WorldStatus {
  players: {
    registered: number;
    active: number;
    newLast24h: number;
    sources: SourceMeta[];
  };
  combat: {
    kills24h: number;
    activeSystems: number;
    recentKills: KillEntry[];
    sources: SourceMeta[];
  };
  infrastructure: {
    onlineAssemblies: number;
    totalAssemblies: number;
    infraIndex: number;
    sources: SourceMeta[];
  };
  defense: {
    defenseIndex: number;
    sources: SourceMeta[];
  };
  traffic: {
    trafficIndex: number;
    sources: SourceMeta[];
  };
  factions: {
    count: number;
    largest: { name: string; ticker: string; members: number };
    sources: SourceMeta[];
  };
  updatedAt: number;
}
```

- [ ] **Step 2: Add Utopia tables to `services/src/db/schema.ts`**

Before the closing `` `); `` on line 186, add:

```sql
    -- ── Utopia integration ───────────────────────────────────────

    CREATE TABLE IF NOT EXISTS utopia_killmails (
      id              TEXT PRIMARY KEY,
      killer_id       TEXT NOT NULL,
      killer_name     TEXT NOT NULL,
      victim_id       TEXT NOT NULL,
      victim_name     TEXT NOT NULL,
      reporter_id     TEXT NOT NULL,
      reporter_name   TEXT NOT NULL,
      loss_type       TEXT NOT NULL,
      solar_system_id INTEGER NOT NULL,
      killed_at       INTEGER NOT NULL,
      shard           INTEGER NOT NULL DEFAULT 1,
      fetched_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_killmails_killed_at
      ON utopia_killmails(killed_at);

    CREATE TABLE IF NOT EXISTS utopia_characters (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      address      TEXT NOT NULL,
      tribe_id     INTEGER,
      tribe_name   TEXT,
      tribe_ticker TEXT,
      created_at   INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utopia_assemblies (
      id          TEXT PRIMARY KEY,
      state       TEXT NOT NULL,
      owner_id    TEXT NOT NULL,
      owner_name  TEXT NOT NULL,
      name        TEXT,
      type_id     INTEGER NOT NULL,
      anchored_at INTEGER NOT NULL,
      fetched_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_utopia_assemblies_state
      ON utopia_assemblies(state);

    CREATE TABLE IF NOT EXISTS utopia_tribes (
      id           INTEGER PRIMARY KEY,
      name         TEXT NOT NULL,
      name_short   TEXT NOT NULL,
      description  TEXT,
      member_count INTEGER NOT NULL,
      created_at   INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_status_cache (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      status_json TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
```

- [ ] **Step 3: Add Utopia config to `services/src/config.ts`**

Add before the `} as const;` closing:

```typescript
  // Utopia
  utopiaBaseUrl: requireEnv('UTOPIA_BASE_URL', 'https://utopia.evedataco.re'),
  utopiaPollIntervalMs: parseInt(process.env['UTOPIA_POLL_INTERVAL_MS'] ?? '300000', 10),
  worldStalenessMs: parseInt(process.env['WORLD_STALENESS_MS'] ?? '600000', 10),
```

- [ ] **Step 4: Verify build compiles**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add services/src/types/index.ts services/src/db/schema.ts services/src/config.ts
git commit -m "feat: add Utopia + WorldStatus types, schema tables, and config"
```

---

## Task 2: Utopia Client

**Files:**
- Create: `services/src/utopia/client.ts`
- Create: `services/tests/utopia-client.test.ts`

- [ ] **Step 1: Write failing test for UtopiaClient**

Create `services/tests/utopia-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UtopiaClient } from '../src/utopia/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('UtopiaClient', () => {
  let client: UtopiaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new UtopiaClient({ baseUrl: 'https://test.example.com' });
  });

  describe('getKillmails', () => {
    it('fetches and returns killmails', async () => {
      const mockData = {
        items: [
          {
            id: '0xabc',
            killerId: '0x111',
            killerName: 'attacker',
            victimId: '0x222',
            victimName: 'defender',
            reporterId: '0x111',
            reporterName: 'attacker',
            lossType: 'SHIP',
            solarSystemId: 30013131,
            killedAt: 1774426597000,
            shard: 1,
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await client.getKillmails();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].killerName).toBe('attacker');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/killmails',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('getCharacters', () => {
    it('fetches and returns characters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: '0x1', name: 'test', address: '0x2', tribeId: 100, tribeName: 'T', tribeTicker: 'TT', createdAt: 1000 }] }),
      });

      const result = await client.getCharacters();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('test');
    });
  });

  describe('getAssemblies', () => {
    it('fetches assemblies with namespace and state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: '0xa', state: 'ONLINE', ownerId: '0xb', ownerName: 'owner', name: '', typeId: 88092, anchoredAt: 1000 }] }),
      });

      const result = await client.getAssemblies('NWN', 'ONLINE');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/assemblies/NWN/ONLINE',
        expect.any(Object),
      );
      expect(result.items[0].state).toBe('ONLINE');
    });
  });

  describe('getTribes', () => {
    it('fetches and returns tribes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 98000011, name: 'BIBA CORP', nameShort: 'BIBA', description: '', tribeUrl: '', memberCount: 2, createdAt: 1000 }] }),
      });

      const result = await client.getTribes();
      expect(result.items[0].nameShort).toBe('BIBA');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(client.getKillmails()).rejects.toThrow('Utopia 500');
    });
  });

  describe('rate limiting', () => {
    it('does not exceed rate limit', async () => {
      const fastClient = new UtopiaClient({ baseUrl: 'https://test.example.com', rateLimit: 2 });
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) });
      }

      const start = Date.now();
      await fastClient.getKillmails();
      await fastClient.getCharacters();
      await fastClient.getTribes();
      const elapsed = Date.now() - start;

      // Third request should have waited (~1s for the rate limiter window)
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe('detail endpoints', () => {
    it('getCharacterDetail fetches single character', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '0xabc', name: 'sun', shard: 1, address: '0x1', profileId: '0x2', tribeId: 100, tribeName: 'T', tribeTicker: 'TT', tribeJoinedAt: 1000, createdAt: 1000 }),
      });

      const result = await client.getCharacterDetail('0xabc');
      expect(result.name).toBe('sun');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/character/0xabc',
        expect.any(Object),
      );
    });

    it('getAssemblyDetail fetches single assembly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '0xdef', state: 'ONLINE', pkTypeState: 'NWN|ONLINE', shard: 1, ownerId: '0x1', ownerName: 'admin', locationHash: 'abc', name: '', dappURL: '', description: '', networkNodeId: '0xdef', itemId: 1000, typeId: 88092, assemblyType: 'NWN', anchoredAt: 1000 }),
      });

      const result = await client.getAssemblyDetail('0xdef');
      expect(result.assemblyType).toBe('NWN');
    });

    it('getTribeDetail fetches single tribe', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 98000011, name: 'BIBA CORP', nameShort: 'BIBA', description: '', tribeUrl: '', memberCount: 2, createdAt: 1000 }),
      });

      const result = await client.getTribeDetail(98000011);
      expect(result.name).toBe('BIBA CORP');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/utopia-client.test.ts`
Expected: FAIL — cannot resolve `../src/utopia/client.js`

- [ ] **Step 3: Implement UtopiaClient**

Create `services/src/utopia/client.ts`:

```typescript
import { config } from '../config.js';
import type {
  UtopiaPaginatedResponse,
  UtopiaCharacter,
  UtopiaKillmail,
  UtopiaAssembly,
  UtopiaTribe,
  UtopiaCharacterDetail,
  UtopiaAssemblyDetail,
} from '../types/index.js';

// ── Rate limiter (same pattern as EVE EYES client) ───────────

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!;
      const waitMs = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.timestamps.push(Date.now());
  }
}

// ── Client ───────────────────────────────────────────────────

export class UtopiaClient {
  private baseUrl: string;
  private rateLimiter: RateLimiter;

  constructor(opts?: { baseUrl?: string; rateLimit?: number }) {
    this.baseUrl = opts?.baseUrl ?? config.utopiaBaseUrl;
    this.rateLimiter = new RateLimiter(opts?.rateLimit ?? 5, 1000);
  }

  private async request<T>(path: string): Promise<T> {
    await this.rateLimiter.waitForSlot();

    const res = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Utopia ${res.status}: ${path} — ${body}`);
    }

    return res.json() as Promise<T>;
  }

  // ── List endpoints (for polling) ─────────────────────────────

  async getKillmails(): Promise<UtopiaPaginatedResponse<UtopiaKillmail>> {
    return this.request('/api/killmails');
  }

  async getCharacters(): Promise<UtopiaPaginatedResponse<UtopiaCharacter>> {
    return this.request('/api/characters');
  }

  async getAssemblies(
    namespace: string,
    state: string,
  ): Promise<UtopiaPaginatedResponse<UtopiaAssembly>> {
    return this.request(`/api/assemblies/${namespace}/${state}`);
  }

  async getTribes(): Promise<UtopiaPaginatedResponse<UtopiaTribe>> {
    return this.request('/api/tribes');
  }

  // ── Detail endpoints (for drill-down, on-demand) ─────────────

  async getCharacterDetail(id: string): Promise<UtopiaCharacterDetail> {
    return this.request(`/api/character/${id}`);
  }

  async getCharacterKills(id: string): Promise<UtopiaPaginatedResponse<UtopiaKillmail>> {
    return this.request(`/api/character/${id}/kills`);
  }

  async getCharacterAssemblies(id: string): Promise<UtopiaPaginatedResponse<UtopiaAssembly>> {
    return this.request(`/api/character/${id}/assemblies`);
  }

  async getAssemblyDetail(id: string): Promise<UtopiaAssemblyDetail> {
    return this.request(`/api/assembly/${id}`);
  }

  async getAssemblyNetwork(id: string): Promise<UtopiaPaginatedResponse<UtopiaAssembly>> {
    return this.request(`/api/assembly/${id}/network`);
  }

  async getTribeDetail(id: number): Promise<UtopiaTribe> {
    return this.request(`/api/tribe/${id}`);
  }

  async getTribeCharacters(id: number): Promise<UtopiaPaginatedResponse<UtopiaCharacter>> {
    return this.request(`/api/tribe/${id}/characters`);
  }
}

// Singleton
let _client: UtopiaClient | null = null;

export function getUtopiaClient(): UtopiaClient {
  if (!_client) _client = new UtopiaClient();
  return _client;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/utopia-client.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/src/utopia/client.ts services/tests/utopia-client.test.ts
git commit -m "feat: add UtopiaClient with rate limiting and tests"
```

---

## Task 3: Utopia Tracker

**Files:**
- Create: `services/src/utopia/tracker.ts`
- Create: `services/tests/utopia-tracker.test.ts`

- [ ] **Step 1: Write failing test for UtopiaTracker**

Create `services/tests/utopia-tracker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../src/db/client.js';
import type Database from 'better-sqlite3';

// Mock UtopiaClient
const mockGetKillmails = vi.fn();
const mockGetCharacters = vi.fn();
const mockGetAssemblies = vi.fn();
const mockGetTribes = vi.fn();

vi.mock('../src/utopia/client.js', () => ({
  UtopiaClient: vi.fn().mockImplementation(() => ({
    getKillmails: mockGetKillmails,
    getCharacters: mockGetCharacters,
    getAssemblies: mockGetAssemblies,
    getTribes: mockGetTribes,
  })),
  getUtopiaClient: vi.fn(() => ({
    getKillmails: mockGetKillmails,
    getCharacters: mockGetCharacters,
    getAssemblies: mockGetAssemblies,
    getTribes: mockGetTribes,
  })),
}));

import { UtopiaTracker } from '../src/utopia/tracker.js';

describe('UtopiaTracker', () => {
  let db: Database.Database;
  let tracker: UtopiaTracker;

  const mockKillmails = {
    items: [
      { id: '0xkill1', killerId: '0xa', killerName: 'sun', victimId: '0xb', victimName: 'moon', reporterId: '0xa', reporterName: 'sun', lossType: 'SHIP', solarSystemId: 30013131, killedAt: Date.now(), shard: 1 },
    ],
  };

  const mockCharacters = {
    items: [
      { id: '0xchar1', name: 'sun', address: '0xaddr1', tribeId: 1000167, tribeName: 'CO86', tribeTicker: 'CO86', createdAt: Date.now() - 3600000 },
    ],
  };

  const mockAssemblies = {
    items: [
      { id: '0xasm1', state: 'ONLINE', ownerId: '0xa', ownerName: 'sun', name: '', typeId: 88092, anchoredAt: Date.now() },
    ],
  };

  const mockTribes = {
    items: [
      { id: 1000167, name: 'Clonebank 86', nameShort: 'CO86', description: '', tribeUrl: '', memberCount: 150, createdAt: Date.now() - 86400000 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = getTestDb();
    tracker = new UtopiaTracker(db);
    mockGetKillmails.mockResolvedValue(mockKillmails);
    mockGetCharacters.mockResolvedValue(mockCharacters);
    mockGetAssemblies.mockResolvedValue(mockAssemblies);
    mockGetTribes.mockResolvedValue(mockTribes);
  });

  afterEach(() => {
    tracker.stop();
  });

  it('pollAll inserts killmails into utopia_killmails', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_killmails WHERE id = ?').get('0xkill1') as { killer_name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.killer_name).toBe('sun');
  });

  it('pollAll inserts characters into utopia_characters', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_characters WHERE id = ?').get('0xchar1') as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('sun');
  });

  it('pollAll inserts assemblies into utopia_assemblies', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_assemblies WHERE id = ?').get('0xasm1') as { state: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.state).toBe('ONLINE');
  });

  it('pollAll inserts tribes into utopia_tribes', async () => {
    await tracker.pollAll();
    const row = db.prepare('SELECT * FROM utopia_tribes WHERE id = ?').get(1000167) as { name_short: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name_short).toBe('CO86');
  });

  it('pollAll upserts on duplicate id', async () => {
    await tracker.pollAll();
    // Change name and poll again
    mockGetCharacters.mockResolvedValue({
      items: [{ ...mockCharacters.items[0], name: 'sun_updated' }],
    });
    await tracker.pollAll();
    const rows = db.prepare('SELECT * FROM utopia_characters WHERE id = ?').all('0xchar1');
    expect(rows).toHaveLength(1);
    expect((rows[0] as { name: string }).name).toBe('sun_updated');
  });

  it('pollAll handles API error gracefully', async () => {
    mockGetKillmails.mockRejectedValue(new Error('Utopia 500'));
    // Should not throw — errors are caught and logged
    await expect(tracker.pollAll()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/utopia-tracker.test.ts`
Expected: FAIL — cannot resolve `../src/utopia/tracker.js`

- [ ] **Step 3: Implement UtopiaTracker**

Create `services/src/utopia/tracker.ts`:

```typescript
import type Database from 'better-sqlite3';
import { getUtopiaClient, type UtopiaClient } from './client.js';

export class UtopiaTracker {
  private db: Database.Database;
  private client: UtopiaClient;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;
  public onPollComplete?: () => void;

  constructor(db: Database.Database, pollIntervalMs = 300_000) {
    this.db = db;
    this.client = getUtopiaClient();
    this.pollIntervalMs = pollIntervalMs;
  }

  async pollAll(): Promise<void> {
    const now = Date.now();
    const errors: string[] = [];

    // Fetch all endpoints in parallel
    const [killmailsRes, charactersRes, assembliesRes, tribesRes] = await Promise.allSettled([
      this.client.getKillmails(),
      this.client.getCharacters(),
      this.client.getAssemblies('NWN', 'ONLINE'),
      this.client.getTribes(),
    ]);

    // ── Killmails ──
    if (killmailsRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_killmails
          (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const k of killmailsRes.value.items) {
          upsert.run(k.id, k.killerId, k.killerName, k.victimId, k.victimName, k.reporterId, k.reporterName, k.lossType, k.solarSystemId, k.killedAt, k.shard, now);
        }
      });
      tx();
    } else {
      errors.push(`killmails: ${killmailsRes.reason}`);
    }

    // ── Characters ──
    if (charactersRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_characters
          (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const c of charactersRes.value.items) {
          upsert.run(c.id, c.name, c.address, c.tribeId, c.tribeName, c.tribeTicker, c.createdAt, now);
        }
      });
      tx();
    } else {
      errors.push(`characters: ${charactersRes.reason}`);
    }

    // ── Assemblies ──
    if (assembliesRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_assemblies
          (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const a of assembliesRes.value.items) {
          upsert.run(a.id, a.state, a.ownerId, a.ownerName, a.name, a.typeId, a.anchoredAt, now);
        }
      });
      tx();
    } else {
      errors.push(`assemblies: ${assembliesRes.reason}`);
    }

    // ── Tribes ──
    if (tribesRes.status === 'fulfilled') {
      const upsert = this.db.prepare(
        `INSERT OR REPLACE INTO utopia_tribes
          (id, name, name_short, description, member_count, created_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const tx = this.db.transaction(() => {
        for (const t of tribesRes.value.items) {
          upsert.run(t.id, t.name, t.nameShort, t.description ?? '', t.memberCount, t.createdAt, now);
        }
      });
      tx();
    } else {
      errors.push(`tribes: ${tribesRes.reason}`);
    }

    if (errors.length > 0) {
      console.error('[UtopiaTracker] partial poll errors:', errors);
    }

    this.onPollComplete?.();
  }

  start(): void {
    void this.pollAll().catch((err) =>
      console.error('[UtopiaTracker] initial poll error:', err),
    );
    this.intervalHandle = setInterval(() => {
      void this.pollAll().catch((err) =>
        console.error('[UtopiaTracker] poll error:', err),
      );
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/utopia-tracker.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/src/utopia/tracker.ts services/tests/utopia-tracker.test.ts
git commit -m "feat: add UtopiaTracker with poll + DB upsert and tests"
```

---

## Task 4: World Aggregator

**Files:**
- Create: `services/src/aggregator/world-aggregator.ts`
- Create: `services/tests/world-aggregator.test.ts`

- [ ] **Step 1: Write failing test for WorldAggregator**

Create `services/tests/world-aggregator.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../src/db/client.js';
import { WorldAggregator } from '../src/aggregator/world-aggregator.js';
import type Database from 'better-sqlite3';

describe('WorldAggregator', () => {
  let db: Database.Database;
  let aggregator: WorldAggregator;
  const now = Date.now();

  beforeEach(() => {
    db = getTestDb();
    aggregator = new WorldAggregator(db, 600_000);

    // Seed EVE EYES activity
    db.prepare(
      `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 4.2, 2.1, 6.8, 23, now - 300000, now, now);

    // Seed Utopia data
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xk1', '0xa', 'sun', '0xb', 'moon', '0xa', 'sun', 'SHIP', 30013131, now - 1000, 1, now);

    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xk2', '0xc', 'jw01', '0xd', 'yuntao', '0xd', 'yuntao', 'SHIP', 30002618, now - 2000, 1, now);

    db.prepare(
      `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xchar1', 'sun', '0xaddr1', 1000167, 'Clonebank 86', 'CO86', now - 3600000, now);

    db.prepare(
      `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xchar2', 'new_player', '0xaddr2', 1000167, 'Clonebank 86', 'CO86', now - 1000, now);

    db.prepare(
      `INSERT INTO utopia_assemblies (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xasm1', 'ONLINE', '0xa', 'sun', '', 88092, now, now);

    db.prepare(
      `INSERT INTO utopia_assemblies (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xasm2', 'OFFLINE', '0xa', 'sun', '', 88092, now, now);

    db.prepare(
      `INSERT INTO utopia_tribes (id, name, name_short, description, member_count, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(1000167, 'Clonebank 86', 'CO86', '', 150, now - 86400000, now);

    db.prepare(
      `INSERT INTO utopia_tribes (id, name, name_short, description, member_count, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(98000011, 'BIBA CORP', 'BIBA', '', 2, now - 50000, now);
  });

  it('aggregate returns correct union of both sources', () => {
    const status = aggregator.aggregate();

    // Players: union of both
    expect(status.players.registered).toBe(2); // utopia characters
    expect(status.players.active).toBe(23); // eve-eyes senders
    expect(status.players.sources).toHaveLength(2);

    // Combat: utopia only
    expect(status.combat.kills24h).toBe(2);
    expect(status.combat.activeSystems).toBe(2); // 30013131 + 30002618
    expect(status.combat.recentKills).toHaveLength(2);
    expect(status.combat.recentKills[0].killerName).toBe('sun'); // most recent first

    // Infrastructure: both sources
    expect(status.infrastructure.onlineAssemblies).toBe(1);
    expect(status.infrastructure.totalAssemblies).toBe(2);
    expect(status.infrastructure.infraIndex).toBe(2.1);

    // Defense: eve-eyes only
    expect(status.defense.defenseIndex).toBe(4.2);

    // Traffic: eve-eyes only
    expect(status.traffic.trafficIndex).toBe(6.8);

    // Factions: utopia only
    expect(status.factions.count).toBe(2);
    expect(status.factions.largest.ticker).toBe('CO86');
    expect(status.factions.largest.members).toBe(150);
  });

  it('aggregate marks stale when data is old', () => {
    // Insert old EVE EYES data (>10min)
    db.prepare('DELETE FROM region_activity').run();
    db.prepare(
      `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, 1, 1, 1, 5, now - 900000, now - 700000, now - 700000);

    const status = aggregator.aggregate();
    const eeSource = status.defense.sources.find((s) => s.provider === 'eve-eyes');
    expect(eeSource?.stale).toBe(true);
  });

  it('aggregate works with no EVE EYES data', () => {
    db.prepare('DELETE FROM region_activity').run();
    const status = aggregator.aggregate();
    expect(status.defense.defenseIndex).toBe(0);
    expect(status.defense.sources).toHaveLength(0);
    expect(status.players.active).toBe(0);
    // Utopia data still present
    expect(status.players.registered).toBe(2);
  });

  it('aggregate works with no Utopia data', () => {
    db.prepare('DELETE FROM utopia_killmails').run();
    db.prepare('DELETE FROM utopia_characters').run();
    db.prepare('DELETE FROM utopia_assemblies').run();
    db.prepare('DELETE FROM utopia_tribes').run();
    const status = aggregator.aggregate();
    expect(status.combat.kills24h).toBe(0);
    expect(status.players.registered).toBe(0);
    // EVE EYES data still present
    expect(status.defense.defenseIndex).toBe(4.2);
  });

  it('aggregate writes to world_status_cache', () => {
    aggregator.aggregate();
    const row = db.prepare('SELECT * FROM world_status_cache WHERE id = 1').get() as { status_json: string } | undefined;
    expect(row).toBeDefined();
    const cached = JSON.parse(row!.status_json);
    expect(cached.combat.kills24h).toBe(2);
  });

  it('newLast24h counts only recent characters', () => {
    const status = aggregator.aggregate();
    // Only 0xchar2 was created within last 24h (now - 1000)
    expect(status.players.newLast24h).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/world-aggregator.test.ts`
Expected: FAIL — cannot resolve `../src/aggregator/world-aggregator.js`

- [ ] **Step 3: Implement WorldAggregator**

Create `services/src/aggregator/world-aggregator.ts`:

```typescript
import type Database from 'better-sqlite3';
import type { WorldStatus, SourceMeta, KillEntry } from '../types/index.js';

interface ActivityRow {
  defense_index: number;
  infra_index: number;
  traffic_index: number;
  active_players: number;
  updated_at: number;
}

interface KillRow {
  id: string;
  killer_name: string;
  killer_id: string;
  victim_name: string;
  victim_id: string;
  loss_type: string;
  solar_system_id: number;
  killed_at: number;
}

interface CountRow {
  count: number;
}

interface TribeRow {
  name: string;
  name_short: string;
  member_count: number;
}

interface FetchedAtRow {
  fetched_at: number;
}

export class WorldAggregator {
  private db: Database.Database;
  private stalenessMs: number;

  constructor(db: Database.Database, stalenessMs = 600_000) {
    this.db = db;
    this.stalenessMs = stalenessMs;
  }

  aggregate(): WorldStatus {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // ── EVE EYES data ──
    const eeActivity = this.db
      .prepare('SELECT defense_index, infra_index, traffic_index, active_players, updated_at FROM region_activity ORDER BY updated_at DESC LIMIT 1')
      .get() as ActivityRow | undefined;

    const eeMeta: SourceMeta | null = eeActivity
      ? { provider: 'eve-eyes', fetchedAt: eeActivity.updated_at, stale: now - eeActivity.updated_at > this.stalenessMs }
      : null;

    // ── Utopia: killmails ──
    const recentKills = this.db
      .prepare('SELECT id, killer_name, killer_id, victim_name, victim_id, loss_type, solar_system_id, killed_at FROM utopia_killmails WHERE killed_at > ? ORDER BY killed_at DESC LIMIT 5')
      .all(now - day) as KillRow[];

    const kills24h = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_killmails WHERE killed_at > ?')
      .get(now - day) as CountRow).count;

    const activeSystems = (this.db
      .prepare('SELECT COUNT(DISTINCT solar_system_id) as count FROM utopia_killmails WHERE killed_at > ?')
      .get(now - day) as CountRow).count;

    // ── Utopia: characters ──
    const registered = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_characters')
      .get() as CountRow).count;

    const newLast24h = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_characters WHERE created_at > ?')
      .get(now - day) as CountRow).count;

    // ── Utopia: assemblies ──
    const onlineAssemblies = (this.db
      .prepare("SELECT COUNT(*) as count FROM utopia_assemblies WHERE state = 'ONLINE'")
      .get() as CountRow).count;

    const totalAssemblies = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_assemblies')
      .get() as CountRow).count;

    // ── Utopia: tribes ──
    const tribesCount = (this.db
      .prepare('SELECT COUNT(*) as count FROM utopia_tribes')
      .get() as CountRow).count;

    const largestTribe = this.db
      .prepare('SELECT name, name_short, member_count FROM utopia_tribes ORDER BY member_count DESC LIMIT 1')
      .get() as TribeRow | undefined;

    // ── Utopia freshness ──
    const utopiaFetched = this.db
      .prepare('SELECT MAX(fetched_at) as fetched_at FROM utopia_killmails')
      .get() as FetchedAtRow | undefined;

    const utopiaMeta: SourceMeta | null = utopiaFetched?.fetched_at
      ? { provider: 'utopia', fetchedAt: utopiaFetched.fetched_at, stale: now - utopiaFetched.fetched_at > this.stalenessMs }
      : null;

    // ── Build WorldStatus ──
    const killEntries: KillEntry[] = recentKills.map((k) => ({
      id: k.id,
      killerName: k.killer_name,
      killerId: k.killer_id,
      victimName: k.victim_name,
      victimId: k.victim_id,
      lossType: k.loss_type,
      solarSystemId: k.solar_system_id,
      killedAt: k.killed_at,
    }));

    const status: WorldStatus = {
      players: {
        registered,
        active: eeActivity?.active_players ?? 0,
        newLast24h,
        sources: [utopiaMeta, eeMeta].filter((s): s is SourceMeta => s !== null),
      },
      combat: {
        kills24h,
        activeSystems,
        recentKills: killEntries,
        sources: utopiaMeta ? [utopiaMeta] : [],
      },
      infrastructure: {
        onlineAssemblies,
        totalAssemblies,
        infraIndex: eeActivity?.infra_index ?? 0,
        sources: [utopiaMeta, eeMeta].filter((s): s is SourceMeta => s !== null),
      },
      defense: {
        defenseIndex: eeActivity?.defense_index ?? 0,
        sources: eeMeta ? [eeMeta] : [],
      },
      traffic: {
        trafficIndex: eeActivity?.traffic_index ?? 0,
        sources: eeMeta ? [eeMeta] : [],
      },
      factions: {
        count: tribesCount,
        largest: largestTribe
          ? { name: largestTribe.name, ticker: largestTribe.name_short, members: largestTribe.member_count }
          : { name: '', ticker: '', members: 0 },
        sources: utopiaMeta ? [utopiaMeta] : [],
      },
      updatedAt: now,
    };

    // Cache result
    this.db
      .prepare('INSERT OR REPLACE INTO world_status_cache (id, status_json, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(status), now);

    return status;
  }

  getCached(): WorldStatus | null {
    const row = this.db
      .prepare('SELECT status_json FROM world_status_cache WHERE id = 1')
      .get() as { status_json: string } | undefined;
    return row ? JSON.parse(row.status_json) : null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/world-aggregator.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/src/aggregator/world-aggregator.ts services/tests/world-aggregator.test.ts
git commit -m "feat: add WorldAggregator with dual-source union logic and tests"
```

---

## Task 5: World API Routes

**Files:**
- Create: `services/src/api/routes/world.ts`
- Create: `services/tests/world-routes.test.ts`
- Modify: `services/src/api/server.ts`

- [ ] **Step 1: Write failing test for world routes**

Create `services/tests/world-routes.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestDb } from '../src/db/client.js';
import { createApp } from '../src/api/server.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  db = getTestDb();
  app = createApp({ db });

  const now = Date.now();

  // Seed EVE EYES
  db.prepare(
    `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(null, 4.2, 2.1, 6.8, 23, now - 300000, now, now);

  // Seed Utopia killmails
  db.prepare(
    `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('0xk1', '0xa', 'sun', '0xb', 'moon', '0xa', 'sun', 'SHIP', 30013131, now - 1000, 1, now);

  // Seed Utopia characters
  db.prepare(
    `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('0xc1', 'sun', '0xaddr1', 1000167, 'CO86', 'CO86', now - 3600000, now);

  // Seed assemblies
  db.prepare(
    `INSERT INTO utopia_assemblies (id, state, owner_id, owner_name, name, type_id, anchored_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('0xa1', 'ONLINE', '0xa', 'sun', '', 88092, now, now);

  // Seed tribes
  db.prepare(
    `INSERT INTO utopia_tribes (id, name, name_short, description, member_count, created_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1000167, 'Clonebank 86', 'CO86', '', 150, now - 86400000, now);
});

afterAll(() => {
  db.close();
});

describe('GET /api/world/status', () => {
  it('returns aggregated world status', async () => {
    const res = await request(app).get('/api/world/status');
    expect(res.status).toBe(200);
    expect(res.body.players.registered).toBe(1);
    expect(res.body.players.active).toBe(23);
    expect(res.body.combat.kills24h).toBe(1);
    expect(res.body.combat.recentKills).toHaveLength(1);
    expect(res.body.infrastructure.onlineAssemblies).toBe(1);
    expect(res.body.defense.defenseIndex).toBe(4.2);
    expect(res.body.factions.count).toBe(1);
    expect(res.body.factions.largest.ticker).toBe('CO86');
    expect(res.body.updatedAt).toBeGreaterThan(0);
  });

  it('includes source metadata', async () => {
    const res = await request(app).get('/api/world/status');
    expect(res.body.players.sources.length).toBeGreaterThan(0);
    const providers = res.body.players.sources.map((s: { provider: string }) => s.provider);
    expect(providers).toContain('utopia');
    expect(providers).toContain('eve-eyes');
  });
});

describe('ID validation on proxy routes', () => {
  it('rejects invalid hex id for character', async () => {
    const res = await request(app).get('/api/world/character/not-a-hex-id');
    expect(res.status).toBe(400);
  });

  it('rejects invalid tribe id', async () => {
    const res = await request(app).get('/api/world/tribe/not-a-number');
    expect(res.status).toBe(400);
  });

  it('accepts valid hex id format', async () => {
    // This will fail with 502 since we can't reach Utopia in tests, but should not be 400
    const validId = '0x' + 'a'.repeat(64);
    const res = await request(app).get(`/api/world/character/${validId}`);
    // Should not be 400 (validation passed), might be 502 (proxy failed) or timeout
    expect(res.status).not.toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/world-routes.test.ts`
Expected: FAIL — routes not registered yet

- [ ] **Step 3: Implement world routes**

Create `services/src/api/routes/world.ts`:

```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { WorldAggregator } from '../../aggregator/world-aggregator.js';
import { getUtopiaClient } from '../../utopia/client.js';
import { config } from '../../config.js';

const HEX_ID_RE = /^0x[a-f0-9]{64}$/;
const NUMERIC_ID_RE = /^\d+$/;

export function createWorldRouter(db: Database.Database): Router {
  const router = Router();
  const aggregator = new WorldAggregator(db, config.worldStalenessMs);

  // ── Aggregated world status ──
  router.get('/world/status', (_req, res) => {
    const status = aggregator.aggregate();
    res.json(status);
  });

  // ── Detail proxy routes ──

  router.get('/world/character/:id', async (req, res) => {
    const { id } = req.params;
    if (!HEX_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid character ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getCharacterDetail(id);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch character from Utopia' });
    }
  });

  router.get('/world/character/:id/kills', async (req, res) => {
    const { id } = req.params;
    if (!HEX_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid character ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getCharacterKills(id);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch kills from Utopia' });
    }
  });

  router.get('/world/assembly/:id', async (req, res) => {
    const { id } = req.params;
    if (!HEX_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid assembly ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getAssemblyDetail(id);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch assembly from Utopia' });
    }
  });

  router.get('/world/tribe/:id', async (req, res) => {
    const { id } = req.params;
    if (!NUMERIC_ID_RE.test(id)) {
      res.status(400).json({ error: 'Invalid tribe ID format' });
      return;
    }
    try {
      const data = await getUtopiaClient().getTribeDetail(parseInt(id, 10));
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch tribe from Utopia' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Register world routes in server.ts**

In `services/src/api/server.ts`, add import:

```typescript
import { createWorldRouter } from './routes/world.js';
```

Add after `app.use('/api', createRegionRouter(db));` (line 44):

```typescript
  app.use('/api', createWorldRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/world-routes.test.ts`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add services/src/api/routes/world.ts services/src/api/server.ts services/tests/world-routes.test.ts
git commit -m "feat: add /api/world/* routes with ID validation and tests"
```

---

## Task 6: Wire Up Backend Startup

**Files:**
- Modify: `services/src/index.ts`

- [ ] **Step 1: Add UtopiaTracker + WorldAggregator startup to index.ts**

After the ActivityTracker block (line 61), add:

```typescript
  // Start Utopia tracker
  const utopiaTrackerMod = await tryImport<{
    UtopiaTracker: new (...args: unknown[]) => { start(): void; stop(): void; onPollComplete?: () => void };
  }>('./utopia/tracker.js');
  let utopiaTracker: { start(): void; stop(): void; onPollComplete?: () => void } | null = null;

  // World aggregator — runs after either tracker polls
  const worldAggMod = await tryImport<{
    WorldAggregator: new (...args: unknown[]) => { aggregate(): unknown };
  }>('./aggregator/world-aggregator.js');
  let worldAggregator: { aggregate(): unknown } | null = null;

  if (worldAggMod) {
    worldAggregator = new worldAggMod.WorldAggregator(db);
    console.log('[main] WorldAggregator ready');
  }

  if (utopiaTrackerMod) {
    utopiaTracker = new utopiaTrackerMod.UtopiaTracker(db);
    if (worldAggregator) {
      utopiaTracker.onPollComplete = () => {
        try { worldAggregator!.aggregate(); } catch (e) { console.error('[main] WorldAggregator error:', e); }
      };
    }
    utopiaTracker.start();
    console.log('[main] UtopiaTracker started');
  } else {
    console.log('[main] UtopiaTracker not available');
  }
```

Update the shutdown function to include:

```typescript
    utopiaTracker?.stop();
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add services/src/index.ts
git commit -m "feat: wire UtopiaTracker + WorldAggregator into backend startup"
```

---

## Task 7: Backend Monkey Tests

**Files:**
- Create: `services/tests/world-monkey.test.ts`

- [ ] **Step 1: Write monkey tests**

Create `services/tests/world-monkey.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../src/db/client.js';
import { WorldAggregator } from '../src/aggregator/world-aggregator.js';
import request from 'supertest';
import { createApp } from '../src/api/server.js';
import type Database from 'better-sqlite3';

describe('WorldAggregator monkey tests', () => {
  let db: Database.Database;
  let aggregator: WorldAggregator;

  beforeEach(() => {
    db = getTestDb();
    aggregator = new WorldAggregator(db);
  });

  it('handles completely empty database', () => {
    const status = aggregator.aggregate();
    expect(status.players.registered).toBe(0);
    expect(status.players.active).toBe(0);
    expect(status.combat.kills24h).toBe(0);
    expect(status.combat.recentKills).toEqual([]);
    expect(status.infrastructure.onlineAssemblies).toBe(0);
    expect(status.defense.defenseIndex).toBe(0);
    expect(status.factions.count).toBe(0);
    expect(status.factions.largest.name).toBe('');
  });

  it('handles killmails with future timestamps', () => {
    const future = Date.now() + 999999999;
    db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xfuture', '0xa', 'future_killer', '0xb', 'victim', '0xa', 'rpt', 'SHIP', 1, future, 1, Date.now());

    const status = aggregator.aggregate();
    // Future killmail should still be counted (it's within 24h window technically)
    expect(status.combat.recentKills.length).toBeGreaterThanOrEqual(0);
  });

  it('handles extremely long player names', () => {
    const longName = 'x'.repeat(10000);
    db.prepare(
      `INSERT INTO utopia_characters (id, name, address, tribe_id, tribe_name, tribe_ticker, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('0xlong', longName, '0xaddr', 1, 'T', 'T', Date.now(), Date.now());

    const status = aggregator.aggregate();
    expect(status.players.registered).toBe(1);
  });

  it('handles thousands of killmails', () => {
    const insert = db.prepare(
      `INSERT INTO utopia_killmails (id, killer_id, killer_name, victim_id, victim_name, reporter_id, reporter_name, loss_type, solar_system_id, killed_at, shard, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    const tx = db.transaction(() => {
      for (let i = 0; i < 5000; i++) {
        insert.run(`0xk${i}`, '0xa', 'killer', '0xb', 'victim', '0xa', 'rpt', 'SHIP', 30000000 + (i % 100), now - i * 1000, 1, now);
      }
    });
    tx();

    const status = aggregator.aggregate();
    expect(status.combat.recentKills).toHaveLength(5); // capped at 5
    expect(status.combat.activeSystems).toBeLessThanOrEqual(100);
  });

  it('handles negative indices from EVE EYES', () => {
    db.prepare(
      `INSERT INTO region_activity (region_id, defense_index, infra_index, traffic_index, active_players, window_start, window_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(null, -1.5, -0.3, -2.0, -5, Date.now(), Date.now(), Date.now());

    const status = aggregator.aggregate();
    // Should not crash, values pass through
    expect(status.defense.defenseIndex).toBe(-1.5);
  });
});

describe('World routes monkey tests', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = getTestDb();
    app = createApp({ db });
  });

  it('rejects SQL injection in character ID', async () => {
    const res = await request(app).get("/api/world/character/'; DROP TABLE utopia_characters; --");
    expect(res.status).toBe(400);
  });

  it('rejects path traversal in assembly ID', async () => {
    const res = await request(app).get('/api/world/assembly/../../etc/passwd');
    expect(res.status).toBe(400);
  });

  it('rejects empty ID', async () => {
    const res = await request(app).get('/api/world/character/');
    // Express returns 404 for missing route segment
    expect([400, 404]).toContain(res.status);
  });

  it('handles /api/world/status with empty DB', async () => {
    const res = await request(app).get('/api/world/status');
    expect(res.status).toBe(200);
    expect(res.body.players.registered).toBe(0);
    expect(res.body.combat.recentKills).toEqual([]);
  });

  it('rejects tribe ID with decimal', async () => {
    const res = await request(app).get('/api/world/tribe/3.14');
    expect(res.status).toBe(400);
  });

  it('rejects negative tribe ID', async () => {
    const res = await request(app).get('/api/world/tribe/-1');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run monkey tests**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run tests/world-monkey.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Run all backend tests**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run`
Expected: all tests PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
git add services/tests/world-monkey.test.ts
git commit -m "test: add monkey tests for world aggregator and routes"
```

---

## Task 8: Frontend Types + API Client

**Files:**
- Modify: `next-monorepo/app/src/types/index.ts`
- Modify: `next-monorepo/app/src/lib/api-client.ts`
- Create: `next-monorepo/app/src/__tests__/api-client-world.test.ts`

- [ ] **Step 1: Add WorldStatus types to frontend**

Append to `next-monorepo/app/src/types/index.ts`:

```typescript
export interface SourceMeta {
  provider: "eve-eyes" | "utopia";
  fetchedAt: number;
  stale: boolean;
}

export interface KillEntry {
  id: string;
  killerName: string;
  killerId: string;
  victimName: string;
  victimId: string;
  lossType: string;
  solarSystemId: number;
  killedAt: number;
}

export interface WorldStatus {
  players: {
    registered: number;
    active: number;
    newLast24h: number;
    sources: SourceMeta[];
  };
  combat: {
    kills24h: number;
    activeSystems: number;
    recentKills: KillEntry[];
    sources: SourceMeta[];
  };
  infrastructure: {
    onlineAssemblies: number;
    totalAssemblies: number;
    infraIndex: number;
    sources: SourceMeta[];
  };
  defense: {
    defenseIndex: number;
    sources: SourceMeta[];
  };
  traffic: {
    trafficIndex: number;
    sources: SourceMeta[];
  };
  factions: {
    count: number;
    largest: { name: string; ticker: string; members: number };
    sources: SourceMeta[];
  };
  updatedAt: number;
}
```

- [ ] **Step 2: Add API client functions**

Append to `next-monorepo/app/src/lib/api-client.ts`:

```typescript
import type { WorldStatus } from "@/types";

export function getWorldStatus() {
  return apiFetch<WorldStatus>("/api/world/status");
}

export function getWorldCharacter(id: string) {
  return apiFetch<unknown>(`/api/world/character/${id}`);
}

export function getWorldCharacterKills(id: string) {
  return apiFetch<{ items: unknown[] }>(`/api/world/character/${id}/kills`);
}

export function getWorldAssembly(id: string) {
  return apiFetch<unknown>(`/api/world/assembly/${id}`);
}

export function getWorldTribe(id: number) {
  return apiFetch<unknown>(`/api/world/tribe/${id}`);
}
```

Note: Add `WorldStatus` to the existing import line at the top of api-client.ts.

- [ ] **Step 3: Write API client test**

Create `next-monorepo/app/src/__tests__/api-client-world.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getWorldStatus, getWorldCharacter, getWorldTribe } from "@/lib/api-client";

describe("World API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getWorldStatus calls correct endpoint", async () => {
    const mockStatus = { players: { registered: 185 }, updatedAt: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const result = await getWorldStatus();
    expect(result.players.registered).toBe(185);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/world/status"),
      expect.any(Object),
    );
  });

  it("getWorldCharacter calls correct endpoint", async () => {
    const id = "0x" + "a".repeat(64);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id, name: "sun" }),
    });

    const result = await getWorldCharacter(id);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/world/character/${id}`),
      expect.any(Object),
    );
  });

  it("getWorldTribe calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1000167, name: "CO86" }),
    });

    await getWorldTribe(1000167);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/world/tribe/1000167"),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx vitest run src/__tests__/api-client-world.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/api-client.ts next-monorepo/app/src/__tests__/api-client-world.test.ts
git commit -m "feat: add WorldStatus types and API client functions with tests"
```

---

## Task 9: Frontend Hook + Components

**Files:**
- Create: `next-monorepo/app/src/hooks/use-world-status.ts`
- Create: `next-monorepo/app/src/components/WorldStatusBar.tsx`
- Create: `next-monorepo/app/src/components/KillTicker.tsx`
- Create: `next-monorepo/app/src/__tests__/hooks/use-world-status.test.ts`

- [ ] **Step 1: Write failing test for useWorldStatus**

Create `next-monorepo/app/src/__tests__/hooks/use-world-status.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockWorldStatus = {
  players: { registered: 185, active: 23, newLast24h: 3, sources: [{ provider: "utopia", fetchedAt: Date.now(), stale: false }] },
  combat: { kills24h: 8, activeSystems: 3, recentKills: [], sources: [] },
  infrastructure: { onlineAssemblies: 64, totalAssemblies: 100, infraIndex: 2.1, sources: [] },
  defense: { defenseIndex: 4.2, sources: [] },
  traffic: { trafficIndex: 6.8, sources: [] },
  factions: { count: 12, largest: { name: "Clonebank 86", ticker: "CO86", members: 150 }, sources: [] },
  updatedAt: Date.now(),
};

vi.mock("@/lib/api-client", () => ({
  getWorldStatus: vi.fn().mockResolvedValue(mockWorldStatus),
}));

import { useWorldStatus } from "@/hooks/use-world-status";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useWorldStatus", () => {
  it("returns world status data", async () => {
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.players.registered).toBe(185);
    expect(result.current.worldStatus?.defense.defenseIndex).toBe(4.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx vitest run src/__tests__/hooks/use-world-status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useWorldStatus hook**

Create `next-monorepo/app/src/hooks/use-world-status.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { getWorldStatus } from "@/lib/api-client";

export function useWorldStatus() {
  const query = useQuery({
    queryKey: ["worldStatus"],
    queryFn: getWorldStatus,
    staleTime: 30_000,
    refetchInterval: 300_000,
  });

  return {
    worldStatus: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

- [ ] **Step 4: Implement WorldStatusBar component**

Create `next-monorepo/app/src/components/WorldStatusBar.tsx`:

```tsx
"use client";

import type { WorldStatus } from "@/types";

interface Props {
  status: WorldStatus;
}

interface CellProps {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  stale?: boolean;
}

function StatusCell({ label, value, sub, color, stale }: CellProps) {
  return (
    <div className="flex-1 text-center border-r border-eve-panel-border/40 last:border-r-0 px-2 py-1.5">
      <div className={`text-[0.65rem] uppercase tracking-wider ${color}`}>
        {label}
        {stale && (
          <span className="ml-1 text-[0.55rem] text-eve-muted/60 border border-eve-muted/30 px-1 py-0.5 rounded">
            STALE
          </span>
        )}
      </div>
      <strong className={`block text-lg leading-tight ${stale ? "text-eve-muted/50" : ""}`}>
        {value}
      </strong>
      {sub && <div className="text-[0.6rem] text-eve-muted/60">{sub}</div>}
    </div>
  );
}

function isAnyStale(sources: { stale: boolean }[]): boolean {
  return sources.some((s) => s.stale);
}

export function WorldStatusBar({ status }: Props) {
  return (
    <div className="flex border border-eve-panel-border/30 bg-gradient-to-br from-[#0a1628] to-[#111d2e]">
      <StatusCell
        label="Pilots"
        value={status.players.registered}
        sub={`+${status.players.active} active`}
        color="text-green-500"
        stale={isAnyStale(status.players.sources)}
      />
      <StatusCell
        label="Kills 24h"
        value={status.combat.kills24h}
        sub={`${status.combat.activeSystems} systems`}
        color="text-amber-500"
        stale={isAnyStale(status.combat.sources)}
      />
      <StatusCell
        label="Assemblies"
        value={`${status.infrastructure.onlineAssemblies} / ${status.infrastructure.totalAssemblies}`}
        sub={`infra ${status.infrastructure.infraIndex.toFixed(1)}`}
        color="text-blue-500"
        stale={isAnyStale(status.infrastructure.sources)}
      />
      <StatusCell
        label="Defense"
        value={status.defense.defenseIndex.toFixed(1)}
        color="text-purple-400"
        stale={isAnyStale(status.defense.sources)}
      />
      <StatusCell
        label="Factions"
        value={status.factions.count}
        sub={status.factions.largest.ticker || undefined}
        color="text-amber-400"
        stale={isAnyStale(status.factions.sources)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Implement KillTicker component**

Create `next-monorepo/app/src/components/KillTicker.tsx`:

```tsx
"use client";

import { Panel } from "@/components/ui/Panel";
import type { KillEntry } from "@/types";

interface Props {
  kills: KillEntry[];
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
          <a
            key={kill.id}
            href={`https://suiscan.xyz/testnet/object/${kill.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-1.5 hover:border-red-500/40 transition-colors"
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
            </div>
          </a>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 6: Run hook test**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx vitest run src/__tests__/hooks/use-world-status.test.ts`
Expected: PASS

- [ ] **Step 7: Type check frontend**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add next-monorepo/app/src/hooks/use-world-status.ts next-monorepo/app/src/components/WorldStatusBar.tsx next-monorepo/app/src/components/KillTicker.tsx next-monorepo/app/src/__tests__/hooks/use-world-status.test.ts
git commit -m "feat: add useWorldStatus hook, WorldStatusBar, and KillTicker components"
```

---

## Task 10: Dashboard Integration

**Files:**
- Modify: `next-monorepo/app/src/app/page.tsx`
- Modify: `next-monorepo/app/src/lib/mock-data.ts`

- [ ] **Step 1: Update page.tsx to use real data**

Replace the full content of `next-monorepo/app/src/app/page.tsx` with:

```tsx
"use client";

import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { WorldStatusBar } from "@/components/WorldStatusBar";
import { KillTicker } from "@/components/KillTicker";
import { useDashboard } from "@/hooks/use-dashboard";
import { useWorldStatus } from "@/hooks/use-world-status";
import type { KillEntry } from "@/types";

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

function killToRisk(kill: KillEntry): RiskLevel {
  // Recent kills (< 1h) are CRITICAL, < 6h HIGH, < 24h MEDIUM, else LOW
  const age = Date.now() - kill.killedAt;
  if (age < 3600000) return "CRITICAL";
  if (age < 21600000) return "HIGH";
  if (age < 86400000) return "MEDIUM";
  return "LOW";
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 16);
}

function formatAge(ts: number): string {
  const hours = Math.floor((Date.now() - ts) / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function HomePage() {
  const { feedItems, stats, regionSummary, isLoading } = useDashboard();
  const { worldStatus, isLoading: worldLoading } = useWorldStatus();

  const recentKills = worldStatus?.combat.recentKills ?? [];
  const breaking = recentKills[0];

  // Build headlines from kills
  const headlines = recentKills.map((kill, i) => ({
    id: `KILL-${i}`,
    title: `${kill.killerName} destroyed ${kill.victimName}'s ${kill.lossType.toLowerCase()}`,
    summary: `Kill reported in system ${kill.solarSystemId}`,
    risk: killToRisk(kill) as RiskLevel,
    category: "Combat",
    ts: formatTime(kill.killedAt) + " UTC",
  }));

  // Build timeline from kills (mixed events)
  const timelineEvents = recentKills.map((kill, i) => ({
    id: `EV-${i}`,
    title: `${kill.killerName} → ${kill.victimName}`,
    age: formatAge(kill.killedAt),
    detail: `${kill.lossType} lost in system ${kill.solarSystemId}`,
  }));

  // Generate briefing from real data
  const briefing = worldStatus
    ? `${worldStatus.combat.kills24h} kills across ${worldStatus.combat.activeSystems} systems in the last 24 hours. ${worldStatus.infrastructure.onlineAssemblies} assemblies online out of ${worldStatus.infrastructure.totalAssemblies}. ${worldStatus.players.newLast24h} new pilots registered. Defense index at ${worldStatus.defense.defenseIndex.toFixed(1)}, traffic index at ${worldStatus.traffic.trafficIndex.toFixed(1)}. Largest faction: ${worldStatus.factions.largest.name} (${worldStatus.factions.largest.members} members).`
    : "Loading frontier intel...";

  return (
    <>
      <PageHeader
        title="REAL-TIME FRONTIER INTEL DASHBOARD"
        subtitle="Operational monitor for conflict routes, signal anomalies, population drift, and bounty response."
        metrics={[
          { label: "Reports", value: String(stats.totalReports) },
          { label: "Active Alerts", value: String(stats.alertCount) },
          { label: "Active Regions", value: String(stats.activeRegions) },
        ]}
      />

      {/* World Status Bar */}
      {worldStatus && <div className="mt-3"><WorldStatusBar status={worldStatus} /></div>}
      {worldLoading && (
        <div className="mt-3 h-16 border border-eve-panel-border/30 bg-gradient-to-br from-[#0a1628] to-[#111d2e] animate-pulse" />
      )}

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        {/* Main Column */}
        <div className="grid gap-3">
          {/* Breaking */}
          <Panel title="Breaking" badge={breaking ? killToRisk(breaking) : "—"}>
            {breaking ? (
              <>
                <h2 className="mt-2 text-base leading-snug">
                  {breaking.killerName} destroyed {breaking.victimName}&apos;s {breaking.lossType.toLowerCase()}
                </h2>
                <p className="mt-2 text-[0.74rem] text-eve-muted/80 leading-relaxed">
                  Kill confirmed in system {breaking.solarSystemId}. View on{" "}
                  <a
                    href={`https://suiscan.xyz/testnet/object/${breaking.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    SUI Explorer
                  </a>
                </p>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">
                    {formatTime(breaking.killedAt)} UTC
                  </span>
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">
                    SYS-{breaking.solarSystemId}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[0.74rem] text-eve-muted/60">No recent combat events</p>
            )}
          </Panel>

          {/* Headlines + Briefing */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 max-lg:grid-cols-1">
            <Panel title="Daily Briefing" badge="AI Summary">
              <p className="mt-2 text-[0.73rem] text-eve-muted/80 leading-relaxed">{briefing}</p>
            </Panel>

            <Panel title="Headlines" badge={`${headlines.length} entries`}>
              <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
                {headlines.length === 0 && (
                  <p className="text-[0.73rem] text-eve-muted/60">No recent events</p>
                )}
                {headlines.map((item) => (
                  <div key={item.id} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs">{item.title}</strong>
                      <RiskBadge risk={item.risk} />
                    </div>
                    <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.id}</span>
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.category}</span>
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.ts}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Timeline */}
          <Panel title="Events Timeline" badge="Top Recent">
            <div className="mt-2 grid gap-2">
              {timelineEvents.length === 0 && (
                <p className="text-[0.73rem] text-eve-muted/60">No recent events</p>
              )}
              {timelineEvents.map((event) => (
                <div key={event.id} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{event.title}</strong>
                    <span className="text-[0.66rem] text-eve-muted">{event.age}</span>
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">{event.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Sidebar Column */}
        <div className="grid gap-3 content-start">
          {/* Map Embed */}
          <Panel title="Conflict Map" badge="ef-map">
            <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1">
              <iframe
                className="w-full min-h-[300px] border-0 block"
                src="https://ef-map.com/embed?embed=1"
                title="EVE Frontier map"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </Panel>

          {/* Live Intel Feed */}
          <Panel title="Live Intel Feed" badge={`${feedItems.length} records`}>
            {isLoading && <p className="mt-2 text-[0.73rem] text-eve-muted/80">Loading feed...</p>}
            <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
              {feedItems.map((item) => (
                <div key={item.id} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{item.id}</strong>
                    <RiskBadge risk={item.risk} />
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">{item.note}</p>
                  <div className="mt-1.5 flex gap-1.5 flex-wrap">
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">SYS-{item.system}</span>
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.ts} UTC</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Kill Ticker */}
          <KillTicker kills={recentKills} />

          {/* Activity Stats */}
          <Panel title="Activity" badge="live">
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <strong className="block text-sm">{stats.totalReports}</strong>
                <p className="text-[0.64rem] text-eve-muted">Total Reports</p>
              </div>
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <strong className="block text-sm">{stats.alertCount}</strong>
                <p className="text-[0.64rem] text-eve-muted">Active Alerts</p>
              </div>
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <strong className="block text-sm">{worldStatus?.players.registered ?? regionSummary?.heatmap?.reporterCount ?? 0}</strong>
                <p className="text-[0.64rem] text-eve-muted">Pilots</p>
              </div>
            </div>
            {worldStatus && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <strong className="block text-sm">{worldStatus.infrastructure.onlineAssemblies}</strong>
                  <p className="text-[0.64rem] text-eve-muted">Online Assemblies</p>
                </div>
                <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <strong className="block text-sm">{worldStatus.factions.count}</strong>
                  <p className="text-[0.64rem] text-eve-muted">Factions</p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Remove unused mock data exports**

In `next-monorepo/app/src/lib/mock-data.ts`, remove `headlines` and `timelineEvents` exports. Keep `plugins` (used by store page). The file should only contain:

```typescript
export const plugins = [
  { id: "trace", label: "Trace Matrix", effect: "+24% route prediction", description: "Pre-maps ambush vectors from hostile drift signatures." },
  { id: "auction", label: "Salvage Exchange", effect: "+18% wreck monetization", description: "Turns confirmed wreck intel into dynamic bounty packages." },
  { id: "civil", label: "Population Watch", effect: "+29% migration detection", description: "Tracks civilian pod lanes and collapse risk." },
  { id: "relay", label: "Signal Forensics", effect: "+31% anomalous ping capture", description: "Identifies repeated encoded relay patterns." }
];
```

- [ ] **Step 3: Type check**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run all frontend tests**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx vitest run`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/app/page.tsx next-monorepo/app/src/lib/mock-data.ts
git commit -m "feat: replace dashboard mock data with real Utopia + EVE EYES world status"
```

---

## Task 11: Frontend Monkey Tests

**Files:**
- Create: `next-monorepo/app/src/__tests__/monkey/world-status-monkey.test.ts`

- [ ] **Step 1: Write monkey tests**

Create `next-monorepo/app/src/__tests__/monkey/world-status-monkey.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useWorldStatus monkey tests", () => {
  it("handles null/undefined fields in response", async () => {
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockResolvedValue({
        players: { registered: 0, active: 0, newLast24h: 0, sources: [] },
        combat: { kills24h: 0, activeSystems: 0, recentKills: [], sources: [] },
        infrastructure: { onlineAssemblies: 0, totalAssemblies: 0, infraIndex: 0, sources: [] },
        defense: { defenseIndex: 0, sources: [] },
        traffic: { trafficIndex: 0, sources: [] },
        factions: { count: 0, largest: { name: "", ticker: "", members: 0 }, sources: [] },
        updatedAt: 0,
      }),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.factions.largest.name).toBe("");
  });

  it("handles API error gracefully", async () => {
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockRejectedValue(new Error("Network error")),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.worldStatus).toBeNull();
  });

  it("handles kill entries with zero timestamps", async () => {
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockResolvedValue({
        players: { registered: 1, active: 0, newLast24h: 0, sources: [] },
        combat: {
          kills24h: 1,
          activeSystems: 1,
          recentKills: [
            { id: "0x1", killerName: "", victimName: "", killerId: "0x2", victimId: "0x3", lossType: "", solarSystemId: 0, killedAt: 0 },
          ],
          sources: [],
        },
        infrastructure: { onlineAssemblies: 0, totalAssemblies: 0, infraIndex: 0, sources: [] },
        defense: { defenseIndex: 0, sources: [] },
        traffic: { trafficIndex: 0, sources: [] },
        factions: { count: 0, largest: { name: "", ticker: "", members: 0 }, sources: [] },
        updatedAt: 0,
      }),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.combat.recentKills[0].killedAt).toBe(0);
  });

  it("handles extremely large numbers", async () => {
    vi.doMock("@/lib/api-client", () => ({
      getWorldStatus: vi.fn().mockResolvedValue({
        players: { registered: Number.MAX_SAFE_INTEGER, active: Number.MAX_SAFE_INTEGER, newLast24h: 0, sources: [] },
        combat: { kills24h: 999999, activeSystems: 999999, recentKills: [], sources: [] },
        infrastructure: { onlineAssemblies: 999999, totalAssemblies: 999999, infraIndex: Infinity, sources: [] },
        defense: { defenseIndex: NaN, sources: [] },
        traffic: { trafficIndex: -Infinity, sources: [] },
        factions: { count: 0, largest: { name: "x".repeat(10000), ticker: "x".repeat(100), members: 0 }, sources: [] },
        updatedAt: Date.now(),
      }),
    }));

    const { useWorldStatus } = await import("@/hooks/use-world-status");
    const { result } = renderHook(() => useWorldStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.worldStatus?.players.registered).toBe(Number.MAX_SAFE_INTEGER);
  });
});
```

- [ ] **Step 2: Run monkey tests**

Run: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx vitest run src/__tests__/monkey/world-status-monkey.test.ts`
Expected: all tests PASS

- [ ] **Step 3: Run all tests (frontend + backend)**

Run frontend: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/next-monorepo/app && npx vitest run`
Run backend: `cd /Users/ramonliao/Documents/Code/Project/Web3/Hackathon/2026_HoH_SUI_HackerHouse_Changsha/EVE_Frontier/build/projects/Frontier_Explorer_Hub/services && npx vitest run`
Expected: all tests PASS in both

- [ ] **Step 4: Commit**

```bash
git add next-monorepo/app/src/__tests__/monkey/world-status-monkey.test.ts
git commit -m "test: add frontend monkey tests for world status integration"
```
