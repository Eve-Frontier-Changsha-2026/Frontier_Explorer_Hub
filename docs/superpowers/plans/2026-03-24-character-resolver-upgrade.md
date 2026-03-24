# Character Resolver Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace EVE EYES-based character resolution with direct Sui RPC queries and expand CharacterInfo to include tribe, tenant, item, and avatar data.

**Architecture:** Two-step RPC resolution (`suix_getOwnedObjects` → `sui_getObject`) replaces the three-step EVE EYES flow. DB schema drops/recreates the `characters` table (cache-only, no migration needed). Frontend adds `useCharacter` hook returning full info, `PlayerCard` component, and tooltip on `CharacterName`.

**Tech Stack:** TypeScript, better-sqlite3, @mysten/sui/client, React, TanStack Query, Tailwind CSS (EVE theme tokens)

**Spec:** `docs/superpowers/specs/2026-03-24-character-resolver-upgrade.md`

---

## File Structure

| Layer | File | Action | Responsibility |
|-------|------|--------|----------------|
| Types | `services/src/types/index.ts` | Modify :139-145 | Expand CharacterInfo (add profileObjectId, tribeId, itemId, tenant, description, avatarUrl; remove ttl) |
| Types | `next-monorepo/app/src/types/index.ts` | Modify :162-167 | Sync CharacterInfo expansion |
| Config | `services/src/config.ts` | Modify :22+ | Add `eveCharacterPackageId` (keep existing `eveWorldPackageId` — used by crawl-eve-systems) |
| DB | `services/src/db/schema.ts` | Modify :161-167 | Drop + recreate characters table with new columns + `cache_ttl` |
| Backend | `services/src/eve-eyes/character-resolver.ts` | Rewrite | Pure RPC resolution, remove EveEyesClient dep, dual TTL strategy |
| Backend | `services/src/api/server.ts` | Modify :48-52 | Remove eveEyesClient from CharacterResolver constructor |
| Frontend | `next-monorepo/app/src/hooks/use-character.ts` | Modify | Add `useCharacter` + `useCharacters`, keep old hooks as wrappers |
| Frontend | `next-monorepo/app/src/components/CharacterName.tsx` | Modify | Add hover tooltip (tribe, tenant, itemId) |
| Frontend | `next-monorepo/app/src/components/PlayerCard.tsx` | Create | Full player info card with avatar |
| Test | `services/src/__tests__/character-resolver.test.ts` | Create | Unit tests for resolver |
| Test | `next-monorepo/app/src/__tests__/hooks/use-character.test.ts` | Modify | Update for expanded CharacterInfo + new hooks |
| Test | `next-monorepo/app/src/__tests__/components/PlayerCard.test.tsx` | Create | PlayerCard render tests |
| Test | `next-monorepo/app/src/__tests__/monkey/character-monkey.test.ts` | Create | Monkey tests for resolver edge cases |

---

## Task 1: Expand CharacterInfo Types (Backend + Frontend)

**Files:**
- Modify: `services/src/types/index.ts:139-145`
- Modify: `next-monorepo/app/src/types/index.ts:162-167`

- [ ] **Step 1: Update backend CharacterInfo**

In `services/src/types/index.ts`, replace the existing `CharacterInfo` interface:

```typescript
export interface CharacterInfo {
  address: string;
  name: string | null;
  characterObjectId: string | null;
  profileObjectId: string | null;
  tribeId: number | null;
  itemId: string | null;
  tenant: string | null;
  description: string | null;
  avatarUrl: string | null;
  resolvedAt: number;
}
```

- [ ] **Step 2: Update frontend CharacterInfo**

In `next-monorepo/app/src/types/index.ts`, replace the existing `CharacterInfo` interface with the same shape (minus `ttl` — frontend never had it):

```typescript
export interface CharacterInfo {
  address: string;
  name: string | null;
  characterObjectId: string | null;
  profileObjectId: string | null;
  tribeId: number | null;
  itemId: string | null;
  tenant: string | null;
  description: string | null;
  avatarUrl: string | null;
  resolvedAt: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add services/src/types/index.ts next-monorepo/app/src/types/index.ts
git commit -m "feat(types): expand CharacterInfo with tribe, tenant, item, avatar fields"
```

---

## Task 2: Config + DB Schema Update

**Files:**
- Modify: `services/src/config.ts:22+`
- Modify: `services/src/db/schema.ts:161-167`

- [ ] **Step 1: Add eveCharacterPackageId to config (keep eveWorldPackageId)**

In `services/src/config.ts`, **add** a new line after the existing `eveWorldPackageId` block (do NOT rename/remove `eveWorldPackageId` — it's used by `crawl-eve-systems.ts`):

```typescript
  eveCharacterPackageId: requireEnv(
    'EVE_CHARACTER_PACKAGE_ID',
    '0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75',
  ),
```

Update `services/.env.example` to add `EVE_CHARACTER_PACKAGE_ID`.

- [ ] **Step 2: Update characters table schema**

In `services/src/db/schema.ts`, replace the existing `characters` table DDL:

```sql
    DROP TABLE IF EXISTS characters;
    CREATE TABLE IF NOT EXISTS characters (
      address            TEXT PRIMARY KEY,
      name               TEXT,
      character_object_id TEXT,
      profile_object_id  TEXT,
      tribe_id           INTEGER,
      item_id            TEXT,
      tenant             TEXT,
      description        TEXT,
      avatar_url         TEXT,
      resolved_at        INTEGER NOT NULL,
      cache_ttl          INTEGER NOT NULL DEFAULT 86400000
    );
```

Note: `DROP TABLE IF EXISTS` is safe — characters is a pure cache table. Data repopulates on next request. `cache_ttl` stores the TTL in ms for dual-TTL strategy (24h success / 1h fallback).

- [ ] **Step 4: Commit**

```bash
git add services/src/config.ts services/src/db/schema.ts
git commit -m "feat(config+db): add eveCharacterPackageId, expand characters table schema"
```

---

## Task 3: Rewrite CharacterResolver (TDD)

**Files:**
- Create: `services/src/__tests__/character-resolver.test.ts`
- Rewrite: `services/src/eve-eyes/character-resolver.ts`

- [ ] **Step 1: Write failing tests for new resolver**

Create `services/src/__tests__/character-resolver.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterResolver } from '../eve-eyes/character-resolver.js';
import { initSchema } from '../db/schema.js';

// Mock SuiClient
function createMockSui(overrides: Record<string, unknown> = {}) {
  return {
    getOwnedObjects: vi.fn().mockResolvedValue({ data: [] }),
    getObject: vi.fn().mockResolvedValue({ data: null }),
    ...overrides,
  } as any;
}

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

describe('CharacterResolver', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  it('returns fallback for address with no PlayerProfile', async () => {
    const sui = createMockSui();
    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xnoone');

    expect(result.address).toBe('0xnoone');
    expect(result.name).toBeNull();
    expect(result.characterObjectId).toBeNull();
    expect(result.profileObjectId).toBeNull();
    expect(result.tribeId).toBeNull();
    expect(sui.getOwnedObjects).toHaveBeenCalledOnce();
  });

  it('resolves full character info from PlayerProfile → Character', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xprofile1',
            content: {
              dataType: 'moveObject',
              fields: { character_id: '0xchar1' },
            },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xchar1',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: {
                fields: { name: 'murphy', description: 'A pilot', url: 'https://avatar.png' },
              },
              tribe_id: '1000167',
              key: {
                fields: { item_id: '2112000186', tenant: 'utopia' },
              },
            },
          },
        },
      }),
    });

    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xplayer');

    expect(result.name).toBe('murphy');
    expect(result.characterObjectId).toBe('0xchar1');
    expect(result.profileObjectId).toBe('0xprofile1');
    expect(result.tribeId).toBe(1000167);
    expect(result.itemId).toBe('2112000186');
    expect(result.tenant).toBe('utopia');
    expect(result.description).toBe('A pilot');
    expect(result.avatarUrl).toBe('https://avatar.png');
  });

  it('returns cached result on second call', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xprofile1',
            content: {
              dataType: 'moveObject',
              fields: { character_id: '0xchar1' },
            },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xchar1',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'cached', description: '', url: '' } },
              tribe_id: '1',
              key: { fields: { item_id: '1', tenant: 't' } },
            },
          },
        },
      }),
    });

    const resolver = new CharacterResolver(db, sui);
    await resolver.resolve('0xcached');
    const second = await resolver.resolve('0xcached');

    expect(second.name).toBe('cached');
    expect(sui.getOwnedObjects).toHaveBeenCalledOnce(); // only 1 RPC call
  });

  it('falls back gracefully on RPC error', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockRejectedValue(new Error('RPC down')),
    });

    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xfail');

    expect(result.name).toBeNull();
    expect(result.resolvedAt).toBeGreaterThan(0);
  });

  it('handles Character with missing metadata fields', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xprofile1',
            content: {
              dataType: 'moveObject',
              fields: { character_id: '0xchar1' },
            },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xchar1',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'sparse' } },
              // no tribe_id, no key
            },
          },
        },
      }),
    });

    const resolver = new CharacterResolver(db, sui);
    const result = await resolver.resolve('0xsparse');

    expect(result.name).toBe('sparse');
    expect(result.tribeId).toBeNull();
    expect(result.itemId).toBeNull();
    expect(result.tenant).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services && npx vitest run src/__tests__/character-resolver.test.ts`
Expected: FAIL — constructor signature mismatch (still expects 3 args)

- [ ] **Step 3: Rewrite character-resolver.ts**

Replace entire file `services/src/eve-eyes/character-resolver.ts`:

```typescript
import type Database from 'better-sqlite3';
import type { SuiClient } from '@mysten/sui/client';
import type { CharacterInfo } from '../types/index.js';
import { config } from '../config.js';

const TTL_SUCCESS_MS = 24 * 60 * 60 * 1000; // 24h
const TTL_FALLBACK_MS = 1 * 60 * 60 * 1000; // 1h

const PLAYER_PROFILE_TYPE = `${config.eveCharacterPackageId}::character::PlayerProfile`;

export class CharacterResolver {
  constructor(
    private db: Database.Database,
    private sui: SuiClient,
  ) {}

  async resolve(address: string): Promise<CharacterInfo> {
    // Step 1: DB cache check
    const cached = this.getCached(address);
    if (cached) return cached;

    const now = Date.now();
    const fallback = this.makeFallback(address, now);

    try {
      // Step 2: Get PlayerProfile owned by wallet
      const profileRes = await this.sui.getOwnedObjects({
        owner: address,
        filter: { StructType: PLAYER_PROFILE_TYPE },
        options: { showContent: true },
      });

      if (!profileRes.data?.length) {
        this.cacheResult(fallback, TTL_FALLBACK_MS);
        return fallback;
      }

      const profileData = profileRes.data[0]!.data;
      if (!profileData?.content || !('fields' in profileData.content)) {
        this.cacheResult(fallback, TTL_FALLBACK_MS);
        return fallback;
      }

      const profileFields = profileData.content.fields as Record<string, unknown>;
      const characterId = profileFields['character_id'] as string | undefined;
      if (!characterId) {
        this.cacheResult(fallback, TTL_FALLBACK_MS);
        return fallback;
      }

      // Step 3: Get Character shared object
      const charObj = await this.sui.getObject({
        id: characterId,
        options: { showContent: true },
      });

      if (!charObj.data?.content || !('fields' in charObj.data.content)) {
        const partial: CharacterInfo = {
          ...fallback,
          profileObjectId: profileData.objectId,
        };
        this.cacheResult(partial, TTL_FALLBACK_MS);
        return partial;
      }

      const fields = charObj.data.content.fields as Record<string, unknown>;
      const metadata = (fields['metadata'] as { fields?: Record<string, unknown> })?.fields ?? {};
      const key = (fields['key'] as { fields?: Record<string, unknown> })?.fields ?? {};
      const tribeIdRaw = fields['tribe_id'];

      const result: CharacterInfo = {
        address,
        name: typeof metadata['name'] === 'string' ? metadata['name'] : null,
        characterObjectId: characterId,
        profileObjectId: profileData.objectId,
        tribeId: tribeIdRaw != null ? Number(tribeIdRaw) : null,
        itemId: typeof key['item_id'] === 'string' ? key['item_id'] : null,
        tenant: typeof key['tenant'] === 'string' ? key['tenant'] : null,
        description: typeof metadata['description'] === 'string' ? metadata['description'] : null,
        avatarUrl: typeof metadata['url'] === 'string' && metadata['url'] !== '' ? metadata['url'] : null,
        resolvedAt: now,
      };

      this.cacheResult(result, TTL_SUCCESS_MS);
      return result;
    } catch {
      this.cacheResult(fallback, TTL_FALLBACK_MS);
      return fallback;
    }
  }

  private getCached(address: string): CharacterInfo | null {
    const row = this.db
      .prepare('SELECT * FROM characters WHERE address = ? AND resolved_at + cache_ttl > ?')
      .get(address, Date.now()) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      address: row['address'] as string,
      name: row['name'] as string | null,
      characterObjectId: row['character_object_id'] as string | null,
      profileObjectId: row['profile_object_id'] as string | null,
      tribeId: row['tribe_id'] != null ? Number(row['tribe_id']) : null,
      itemId: row['item_id'] as string | null,
      tenant: row['tenant'] as string | null,
      description: row['description'] as string | null,
      avatarUrl: row['avatar_url'] as string | null,
      resolvedAt: row['resolved_at'] as number,
    };
  }

  private makeFallback(address: string, now: number): CharacterInfo {
    return {
      address,
      name: null,
      characterObjectId: null,
      profileObjectId: null,
      tribeId: null,
      itemId: null,
      tenant: null,
      description: null,
      avatarUrl: null,
      resolvedAt: now,
    };
  }

  private cacheResult(info: CharacterInfo, ttlMs: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO characters
         (address, name, character_object_id, profile_object_id, tribe_id, item_id, tenant, description, avatar_url, resolved_at, cache_ttl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        info.address, info.name, info.characterObjectId, info.profileObjectId,
        info.tribeId, info.itemId, info.tenant, info.description, info.avatarUrl,
        info.resolvedAt, ttlMs,
      );
  }
}
```

The `cache_ttl` column stores the TTL in ms per entry. Cache query uses `resolved_at + cache_ttl > now` for precise dual-TTL: 24h for successful resolves, 1h for fallback (no PlayerProfile / RPC error).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services && npx vitest run src/__tests__/character-resolver.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add services/src/__tests__/character-resolver.test.ts services/src/eve-eyes/character-resolver.ts
git commit -m "feat(resolver): rewrite CharacterResolver to use direct Sui RPC queries"
```

---

## Task 4: Update Server Wiring

**Files:**
- Modify: `services/src/api/server.ts:48-52`

- [ ] **Step 1: Remove eveEyesClient from CharacterResolver constructor**

In `services/src/api/server.ts`, replace lines 48-52:

```typescript
  // Character route — requires sui client
  if (suiClient) {
    const resolver = new CharacterResolver(db, suiClient);
    app.use('/api', createCharacterRouter(resolver));
  }
```

- [ ] **Step 2: Remove unused EveEyesClient import if no longer needed**

Check if `eveEyesClient` is still used elsewhere in `server.ts`. The `EveEyesClient` import (line 14) may still be needed for other routes or the type definition. Only remove if fully unused.

- [ ] **Step 3: Run type check**

Run: `cd services && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add services/src/api/server.ts
git commit -m "refactor(server): simplify CharacterResolver wiring, remove EveEyesClient dependency"
```

---

## Task 5: Frontend Hooks Upgrade (TDD)

**Files:**
- Modify: `next-monorepo/app/src/hooks/use-character.ts`
- Modify: `next-monorepo/app/src/__tests__/hooks/use-character.test.ts`

- [ ] **Step 1: Update test mocks to use expanded CharacterInfo**

In `use-character.test.ts`, update all `mockResolvedValue` calls to include the new fields. Add tests for `useCharacter` and `useCharacters`:

```typescript
// Add to the existing test file after the useCharacterNames describe block:

describe("useCharacter", () => {
  it("returns full CharacterInfo", async () => {
    mocked.mockResolvedValue({
      address: "0xplayer",
      name: "murphy",
      characterObjectId: "0xchar",
      profileObjectId: "0xprof",
      tribeId: 1000167,
      itemId: "2112000186",
      tenant: "utopia",
      description: "A brave pilot",
      avatarUrl: "https://avatar.png",
      resolvedAt: Date.now(),
    });
    const { result } = renderHook(() => useCharacter("0xplayer"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.name).toBe("murphy");
    expect(result.current.data?.tribeId).toBe(1000167);
    expect(result.current.data?.tenant).toBe("utopia");
  });

  it("returns null data when address is null", () => {
    const { result } = renderHook(() => useCharacter(null), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useCharacters", () => {
  it("returns Map<string, CharacterInfo>", async () => {
    mocked.mockImplementation(async (addr) => ({
      address: addr,
      name: `Name-${addr.slice(-3)}`,
      characterObjectId: null,
      profileObjectId: null,
      tribeId: null,
      itemId: null,
      tenant: null,
      description: null,
      avatarUrl: null,
      resolvedAt: Date.now(),
    }));
    const { result } = renderHook(() => useCharacters(["0xaaa", "0xbbb"]), { wrapper });
    await waitFor(() => {
      expect(result.current.get("0xaaa")?.name).toBe("Name-aaa");
    });
    expect(result.current.get("0xaaa")?.tribeId).toBeNull();
  });
});
```

Update existing mock return values to include the new fields (`profileObjectId: null, tribeId: null, itemId: null, tenant: null, description: null, avatarUrl: null`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-character.test.ts`
Expected: FAIL — `useCharacter` and `useCharacters` not exported

- [ ] **Step 3: Implement hook upgrades**

Replace `next-monorepo/app/src/hooks/use-character.ts`:

```typescript
"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { getCharacter } from "@/lib/api-client";
import { useMemo } from "react";
import type { CharacterInfo } from "@/types";

const CHARACTER_STALE_TIME = 24 * 60 * 60 * 1000;

/** Full CharacterInfo — primary hook */
export function useCharacter(address: string | null) {
  return useQuery({
    queryKey: ["character", address],
    queryFn: () => getCharacter(address!),
    enabled: !!address,
    staleTime: CHARACTER_STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/** Batch full CharacterInfo */
export function useCharacters(addresses: string[]) {
  const key = addresses.slice().sort().join(",");
  const unique = useMemo(() => [...new Set(addresses)], [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const queries = useQueries({
    queries: unique.map((addr) => ({
      queryKey: ["character", addr],
      queryFn: () => getCharacter(addr),
      staleTime: CHARACTER_STALE_TIME,
      refetchOnWindowFocus: false,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, CharacterInfo>();
    unique.forEach((addr, i) => {
      const d = queries[i]?.data;
      if (d) map.set(addr, d);
    });
    return map;
  }, [unique, queries]);
}

// ── Backwards-compatible wrappers ────────────────────────────

/** @deprecated Use `useCharacter` instead */
export function useCharacterName(address: string | null) {
  const query = useCharacter(address);
  return {
    name: query.data?.name ?? null,
    isLoading: !!address && query.isLoading,
    isError: query.isError,
  };
}

/** @deprecated Use `useCharacters` instead */
export function useCharacterNames(addresses: string[]) {
  const charMap = useCharacters(addresses);
  return useMemo(() => {
    const map = new Map<string, { name: string | null; isLoading: boolean }>();
    for (const addr of addresses) {
      const info = charMap.get(addr);
      map.set(addr, {
        name: info?.name ?? null,
        isLoading: !info,
      });
    }
    return map;
  }, [charMap, addresses]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-character.test.ts`
Expected: PASS (all tests including new ones)

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/hooks/use-character.ts next-monorepo/app/src/__tests__/hooks/use-character.test.ts
git commit -m "feat(hooks): add useCharacter/useCharacters, keep old hooks as wrappers"
```

---

## Task 6: CharacterName Tooltip

**Files:**
- Modify: `next-monorepo/app/src/components/CharacterName.tsx`

- [ ] **Step 1: Add hover tooltip to CharacterName**

Replace `next-monorepo/app/src/components/CharacterName.tsx`:

```tsx
"use client";

import { useCharacter } from "@/hooks/use-character";

interface CharacterNameProps {
  address: string;
  truncateLength?: number;
  showAddress?: boolean;
  className?: string;
}

function truncateAddr(addr: string, len: number): string {
  if (addr.length <= len * 2 + 4) return addr;
  return `${addr.slice(0, len + 2)}...${addr.slice(-len)}`;
}

export function CharacterName({
  address,
  truncateLength = 6,
  showAddress = false,
  className = "",
}: CharacterNameProps) {
  const { data, isLoading } = useCharacter(address);
  const truncated = truncateAddr(address, truncateLength);

  if (isLoading) {
    return (
      <span
        className={`inline-block bg-eve-panel-border/30 animate-pulse rounded-sm ${className}`}
        style={{ width: `${truncateLength * 2 + 4}ch`, height: "1em" }}
      />
    );
  }

  if (data?.name) {
    const tooltipLines: string[] = [];
    if (data.tribeId != null) tooltipLines.push(`tribe #${data.tribeId}`);
    if (data.tenant) tooltipLines.push(data.tenant);
    if (data.itemId) tooltipLines.push(`item: ${data.itemId}`);

    return (
      <span className={`relative group inline-flex items-center ${className}`}>
        <span className="text-eve-gold cursor-default" title={address}>
          {data.name}
          {showAddress && (
            <span className="text-eve-muted text-[0.6rem] ml-1">({truncated})</span>
          )}
        </span>
        {tooltipLines.length > 0 && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-eve-panel border border-eve-panel-border text-[0.65rem] text-eve-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {tooltipLines.join(" · ")}
          </span>
        )}
      </span>
    );
  }

  return <span className={`text-eve-muted font-mono ${className}`}>{truncated}</span>;
}
```

- [ ] **Step 2: Verify no TS errors**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/components/CharacterName.tsx
git commit -m "feat(CharacterName): add hover tooltip showing tribe, tenant, itemId"
```

---

## Task 7: PlayerCard Component (TDD)

**Files:**
- Create: `next-monorepo/app/src/__tests__/components/PlayerCard.test.tsx`
- Create: `next-monorepo/app/src/components/PlayerCard.tsx`

- [ ] **Step 1: Write failing tests**

Create `next-monorepo/app/src/__tests__/components/PlayerCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerCard } from "@/components/PlayerCard";

vi.mock("@/hooks/use-character", () => ({
  useCharacter: vi.fn(),
}));

import { useCharacter } from "@/hooks/use-character";
const mocked = vi.mocked(useCharacter);

describe("PlayerCard", () => {
  it("renders loading skeleton", () => {
    mocked.mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);
    render(<PlayerCard address="0xabc" />);
    expect(screen.getByTestId("player-card-skeleton")).toBeInTheDocument();
  });

  it("renders full player info", () => {
    mocked.mockReturnValue({
      data: {
        address: "0xplayer",
        name: "murphy",
        characterObjectId: "0xchar",
        profileObjectId: "0xprof",
        tribeId: 1000167,
        itemId: "2112000186",
        tenant: "utopia",
        description: "A brave pilot",
        avatarUrl: null,
        resolvedAt: Date.now(),
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<PlayerCard address="0xplayer" />);
    expect(screen.getByText("murphy")).toBeInTheDocument();
    expect(screen.getByText(/tribe #1000167/)).toBeInTheDocument();
    expect(screen.getByText("utopia")).toBeInTheDocument();
    expect(screen.getByText(/2112000186/)).toBeInTheDocument();
  });

  it("renders fallback for unresolved address", () => {
    mocked.mockReturnValue({
      data: {
        address: "0xunknown",
        name: null,
        characterObjectId: null,
        profileObjectId: null,
        tribeId: null,
        itemId: null,
        tenant: null,
        description: null,
        avatarUrl: null,
        resolvedAt: Date.now(),
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<PlayerCard address="0xunknown" />);
    expect(screen.getByText(/0xunknown/)).toBeInTheDocument();
    expect(screen.queryByText("tribe")).not.toBeInTheDocument();
  });

  it("renders avatar image when avatarUrl provided", () => {
    mocked.mockReturnValue({
      data: {
        address: "0x1",
        name: "pilot",
        avatarUrl: "https://example.com/avatar.png",
        characterObjectId: null, profileObjectId: null,
        tribeId: null, itemId: null, tenant: null, description: null,
        resolvedAt: Date.now(),
      },
      isLoading: false,
      isError: false,
    } as any);

    render(<PlayerCard address="0x1" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("avatar.png"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/PlayerCard.test.tsx`
Expected: FAIL — `PlayerCard` module not found

- [ ] **Step 3: Implement PlayerCard**

Create `next-monorepo/app/src/components/PlayerCard.tsx`:

```tsx
"use client";

import { useCharacter } from "@/hooks/use-character";

interface PlayerCardProps {
  address: string;
  className?: string;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function AddressGradient({ address }: { address: string }) {
  // Deterministic gradient from address bytes
  const seed = parseInt(address.slice(2, 10), 16);
  const h1 = seed % 360;
  const h2 = (seed * 7) % 360;
  return (
    <div
      className="w-10 h-10 rounded-full shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${h1}, 60%, 40%), hsl(${h2}, 50%, 30%))`,
      }}
    />
  );
}

export function PlayerCard({ address, className = "" }: PlayerCardProps) {
  const { data, isLoading } = useCharacter(address);

  if (isLoading) {
    return (
      <div
        data-testid="player-card-skeleton"
        className={`flex gap-3 items-center p-3 rounded-lg border border-eve-panel-border bg-eve-panel animate-pulse ${className}`}
      >
        <div className="w-10 h-10 rounded-full bg-eve-panel-border/30" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-20 bg-eve-panel-border/30 rounded" />
          <div className="h-2.5 w-28 bg-eve-panel-border/30 rounded" />
        </div>
      </div>
    );
  }

  const name = data?.name;
  const truncated = truncateAddr(address);

  return (
    <div
      className={`flex gap-3 items-start p-3 rounded-lg border border-eve-panel-border bg-eve-panel ${className}`}
    >
      {/* Avatar */}
      {data?.avatarUrl ? (
        <img
          src={data.avatarUrl}
          alt={name ?? truncated}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <AddressGradient address={address} />
      )}

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-0.5">
        {name ? (
          <div className="text-eve-gold font-medium text-sm truncate">{name}</div>
        ) : (
          <div className="text-eve-muted font-mono text-xs">{truncated}</div>
        )}

        {data?.tribeId != null && (
          <div className="text-eve-muted text-[0.65rem]">tribe #{data.tribeId}</div>
        )}
        {data?.tenant && (
          <div className="text-eve-cold text-[0.65rem]">{data.tenant}</div>
        )}

        <div className="text-eve-muted/60 font-mono text-[0.6rem] truncate">{truncated}</div>

        {data?.itemId && (
          <div className="text-eve-muted/50 text-[0.6rem]">item: {data.itemId}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/PlayerCard.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/src/components/PlayerCard.tsx next-monorepo/app/src/__tests__/components/PlayerCard.test.tsx
git commit -m "feat(PlayerCard): new component showing full character info with avatar"
```

---

## Task 8: Monkey Tests

**Files:**
- Create: `services/src/__tests__/character-resolver-monkey.test.ts`
- Modify: `next-monorepo/app/src/__tests__/monkey/eve-eyes-monkey.test.ts`

- [ ] **Step 1: Write backend monkey tests**

Create `services/src/__tests__/character-resolver-monkey.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterResolver } from '../eve-eyes/character-resolver.js';
import { initSchema } from '../db/schema.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function createMockSui(overrides: Record<string, unknown> = {}) {
  return {
    getOwnedObjects: vi.fn().mockResolvedValue({ data: [] }),
    getObject: vi.fn().mockResolvedValue({ data: null }),
    ...overrides,
  } as any;
}

describe('CharacterResolver — monkey tests', () => {
  it('handles empty string address', async () => {
    const resolver = new CharacterResolver(createDb(), createMockSui());
    const result = await resolver.resolve('');
    expect(result.address).toBe('');
    expect(result.name).toBeNull();
  });

  it('handles extremely long address', async () => {
    const longAddr = '0x' + 'a'.repeat(1000);
    const resolver = new CharacterResolver(createDb(), createMockSui());
    const result = await resolver.resolve(longAddr);
    expect(result.address).toBe(longAddr);
  });

  it('handles malformed getOwnedObjects response (missing data array)', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({}),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    // Should not throw, should fallback
    const result = await resolver.resolve('0xmalformed');
    expect(result.name).toBeNull();
  });

  it('handles Character object with null content', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xp',
            content: { dataType: 'moveObject', fields: { character_id: '0xc' } },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({ data: { objectId: '0xc', content: null } }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xnull');
    expect(result.profileObjectId).toBe('0xp');
    expect(result.name).toBeNull();
  });

  it('handles tribe_id as string "0" (falsy but valid)', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xp',
            content: { dataType: 'moveObject', fields: { character_id: '0xc' } },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xc',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'zero' } },
              tribe_id: '0',
              key: { fields: {} },
            },
          },
        },
      }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xzero');
    expect(result.tribeId).toBe(0); // should be 0, not null
  });

  it('concurrent resolve for same address deduplicates via cache', async () => {
    let callCount = 0;
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { data: [] };
      }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    await Promise.all([
      resolver.resolve('0xrace'),
      resolver.resolve('0xrace'),
    ]);
    // Both may hit RPC (no in-flight dedup), but second should still succeed
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('handles RPC timeout (rejected promise)', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xtimeout');
    expect(result.name).toBeNull();
    expect(result.resolvedAt).toBeGreaterThan(0);
  });

  it('treats empty-string avatarUrl as null', async () => {
    const sui = createMockSui({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [{
          data: {
            objectId: '0xp',
            content: { dataType: 'moveObject', fields: { character_id: '0xc' } },
          },
        }],
      }),
      getObject: vi.fn().mockResolvedValue({
        data: {
          objectId: '0xc',
          content: {
            dataType: 'moveObject',
            fields: {
              metadata: { fields: { name: 'noavatar', url: '' } },
              tribe_id: '1',
              key: { fields: { item_id: '1', tenant: 't' } },
            },
          },
        },
      }),
    });
    const resolver = new CharacterResolver(createDb(), sui);
    const result = await resolver.resolve('0xempty');
    expect(result.avatarUrl).toBeNull(); // empty string → null
  });
});
```

- [ ] **Step 2: Update frontend monkey tests**

In `next-monorepo/app/src/__tests__/monkey/eve-eyes-monkey.test.ts`, update mock return values to include new CharacterInfo fields. Add to the existing character section:

```typescript
// Add test for useCharacter with partial data
it("useCharacter handles response with all-null optional fields", async () => {
  mocked.mockResolvedValue({
    address: "0xnull",
    name: null,
    characterObjectId: null,
    profileObjectId: null,
    tribeId: null,
    itemId: null,
    tenant: null,
    description: null,
    avatarUrl: null,
    resolvedAt: Date.now(),
  });
  const { result } = renderHook(() => useCharacterName("0xnull"), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.name).toBeNull();
});
```

- [ ] **Step 3: Run all monkey tests**

Run: `cd services && npx vitest run src/__tests__/character-resolver-monkey.test.ts`
Run: `cd next-monorepo/app && npx vitest run src/__tests__/monkey/eve-eyes-monkey.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/src/__tests__/character-resolver-monkey.test.ts next-monorepo/app/src/__tests__/monkey/eve-eyes-monkey.test.ts
git commit -m "test(monkey): add character resolver edge case tests"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd services && npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run full frontend test suite**

Run: `cd next-monorepo/app && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Run full type check on both packages**

Run: `cd services && npx tsc --noEmit`
Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Update progress.md**

Mark Character Resolver Upgrade TODO as complete, add to Recently Completed section.
