# EVE EYES Frontend Integration (E4-E5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire EVE EYES backend data (region activity indices + character name resolver) into the frontend — map page sidebar/overview and bounty detail pages.

**Architecture:** Two independent features (E4, E5) sharing the same plumbing pattern: add types → update api-client → create hook → create component → integrate into pages. E4 reuses the existing `getRegionSummary` endpoint with corrected types. E5 adds a new `getCharacter` api-client function with a `useCharacterName` hook.

**Tech Stack:** Next.js 14 App Router, TanStack Query v5, Tailwind CSS (EVE theme tokens), Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-eve-eyes-frontend-e4-e5.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | Add `RegionActivity`, `RegionSummary`, `CharacterInfo` |
| `src/lib/api-client.ts` | Modify | Fix `getRegionSummary` return type, add `getCharacter` |
| `src/hooks/use-region-activity.ts` | Create | `useRegionActivity` hook wrapping region summary query |
| `src/hooks/use-character.ts` | Create | `useCharacterName` + `useCharacterNames` hooks |
| `src/components/RegionActivityPanel.tsx` | Create | Full + compact activity display |
| `src/components/CharacterName.tsx` | Create | Inline name resolver component |
| `src/app/map/page.tsx` | Modify | Integrate RegionActivityPanel (sidebar + overview) |
| `src/components/bounty/ProofTimeline.tsx` | Modify | Replace address truncation with `<CharacterName>` |
| `src/components/bounty/ClaimTicketList.tsx` | Modify | Replace address truncation with `<CharacterName>` |
| `src/__tests__/api-client-eve-eyes.test.ts` | Create | Tests for `getRegionSummary` + `getCharacter` |
| `src/__tests__/hooks/use-region-activity.test.ts` | Create | Hook tests |
| `src/__tests__/hooks/use-character.test.ts` | Create | Hook tests |
| `src/__tests__/monkey/eve-eyes-monkey.test.ts` | Create | Monkey tests for edge cases |

All paths relative to `next-monorepo/app/`.

---

### Task 1: Types + API Client

**Files:**
- Modify: `src/types/index.ts` (append after line 155)
- Modify: `src/lib/api-client.ts` (lines 47-54, append)
- Create: `src/__tests__/api-client-eve-eyes.test.ts`

- [ ] **Step 1: Add types**

In `src/types/index.ts`, append:

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

export interface CharacterInfo {
  address: string;
  name: string | null;
  characterObjectId: string | null;
  resolvedAt: number;
}
```

- [ ] **Step 2: Update `getRegionSummary` return type**

In `src/lib/api-client.ts`, replace the current `getRegionSummary` function (lines 47-54):

```ts
// Before: ad-hoc return type that doesn't match backend
export function getRegionSummary(regionId: number) {
  return apiFetch<RegionSummary>(`/api/region/${regionId}/summary`);
}
```

Add import of `RegionSummary` and `CharacterInfo` to the import line.

- [ ] **Step 2.5: Verify no consumers depend on old `getRegionSummary` shape**

Run: `cd next-monorepo/app && grep -rn 'regionSummary\.' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '__tests__'`

Check that no consumer reads `regionSummary.totalReports`, `regionSummary.byType`, or `regionSummary.activeBounties`. The only consumer is `useDashboard` which returns raw `.data` — callers just get the new correct shape. If any consumer reads old fields, update them.

- [ ] **Step 3: Add `getCharacter` function**

Append to `src/lib/api-client.ts`:

```ts
export function getCharacter(address: string) {
  return apiFetch<CharacterInfo>(`/api/character/${address}`);
}
```

- [ ] **Step 4: Write api-client tests**

Create `src/__tests__/api-client-eve-eyes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRegionSummary, getCharacter, setJwt } from "@/lib/api-client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  setJwt(null);
});

describe("getRegionSummary", () => {
  const mockResponse = {
    regionId: 42,
    heatmap: { totalReports: 10, reporterCount: 3 },
    activity: {
      defenseIndex: 55,
      infraIndex: 30,
      trafficIndex: 72,
      activePlayers: 8,
      windowStart: 1711234567000,
      windowEnd: 1711238167000,
      updatedAt: 1711238167000,
    },
  };

  it("calls correct endpoint and returns RegionSummary", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
    const result = await getRegionSummary(42);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/region/42/summary"),
      expect.any(Object),
    );
  });

  it("returns null activity when no data", async () => {
    const noActivity = { ...mockResponse, activity: null };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(noActivity) });
    const result = await getRegionSummary(42);
    expect(result.activity).toBeNull();
  });
});

describe("getCharacter", () => {
  it("calls correct endpoint and returns CharacterInfo", async () => {
    const mockChar = {
      address: "0xabc123",
      name: "DarkPilot",
      characterObjectId: "0xobj456",
      resolvedAt: 1711238167000,
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockChar) });
    const result = await getCharacter("0xabc123");
    expect(result).toEqual(mockChar);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/character/0xabc123"),
      expect.any(Object),
    );
  });

  it("returns null name for unresolvable address", async () => {
    const unknown = { address: "0xunknown", name: null, characterObjectId: null, resolvedAt: 0 };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(unknown) });
    const result = await getCharacter("0xunknown");
    expect(result.name).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/api-client-eve-eyes.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 6: Type-check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add next-monorepo/app/src/types/index.ts next-monorepo/app/src/lib/api-client.ts next-monorepo/app/src/__tests__/api-client-eve-eyes.test.ts
git commit -m "feat(eve-eyes): add RegionSummary + CharacterInfo types and api-client functions"
```

---

### Task 2: `useRegionActivity` Hook

**Files:**
- Create: `src/hooks/use-region-activity.ts`
- Create: `src/__tests__/hooks/use-region-activity.test.ts`

- [ ] **Step 1: Write tests**

Create `src/__tests__/hooks/use-region-activity.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getRegionSummary: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isPremium: false }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRegionActivity } from "@/hooks/use-region-activity";
import { getRegionSummary } from "@/lib/api-client";

const mocked = vi.mocked(getRegionSummary);

beforeEach(() => { mocked.mockReset(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const mockSummary = {
  regionId: 42,
  heatmap: { totalReports: 10, reporterCount: 3 },
  activity: {
    defenseIndex: 55, infraIndex: 30, trafficIndex: 72, activePlayers: 8,
    windowStart: Date.now() - 300_000, windowEnd: Date.now(), updatedAt: Date.now(),
  },
};

describe("useRegionActivity", () => {
  it("returns null when regionId is null", () => {
    const { result } = renderHook(() => useRegionActivity(null), { wrapper });
    expect(result.current.activity).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("fetches and returns activity for valid regionId", async () => {
    mocked.mockResolvedValue(mockSummary);
    const { result } = renderHook(() => useRegionActivity(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activity).toEqual(mockSummary.activity);
    expect(result.current.heatmap).toEqual(mockSummary.heatmap);
  });

  it("returns isStale=true when updatedAt is older than 10min", async () => {
    const stale = {
      ...mockSummary,
      activity: { ...mockSummary.activity!, updatedAt: Date.now() - 11 * 60 * 1000 },
    };
    mocked.mockResolvedValue(stale);
    const { result } = renderHook(() => useRegionActivity(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isStale).toBe(true);
  });

  it("returns isStale=false when activity is null", async () => {
    mocked.mockResolvedValue({ ...mockSummary, activity: null });
    const { result } = renderHook(() => useRegionActivity(42), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isStale).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-region-activity.test.ts`
Expected: FAIL — module `use-region-activity` not found

- [ ] **Step 3: Implement hook**

Create `src/hooks/use-region-activity.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { getRegionSummary } from "@/lib/api-client";
import type { RegionActivity } from "@/types";

const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export function useRegionActivity(regionId: number | null) {
  const query = useQuery({
    queryKey: ["regionSummary", regionId],
    queryFn: () => getRegionSummary(regionId!),
    enabled: regionId != null && !Number.isNaN(regionId),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const activity: RegionActivity | null = query.data?.activity ?? null;
  const heatmap = query.data?.heatmap ?? null;
  const isStale = activity
    ? Date.now() - activity.updatedAt > STALE_THRESHOLD_MS
    : false;

  return {
    activity,
    heatmap,
    isLoading: regionId != null && !Number.isNaN(regionId) && query.isLoading,
    isError: query.isError,
    isStale,
  };
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-region-activity.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/hooks/use-region-activity.ts next-monorepo/app/src/__tests__/hooks/use-region-activity.test.ts
git commit -m "feat(eve-eyes): add useRegionActivity hook with shared query key"
```

---

### Task 3: `useCharacterName` Hook

**Files:**
- Create: `src/hooks/use-character.ts`
- Create: `src/__tests__/hooks/use-character.test.ts`

- [ ] **Step 1: Write tests**

Create `src/__tests__/hooks/use-character.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getCharacter: vi.fn(),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useCharacterName, useCharacterNames } from "@/hooks/use-character";
import { getCharacter } from "@/lib/api-client";

const mocked = vi.mocked(getCharacter);

beforeEach(() => { mocked.mockReset(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCharacterName", () => {
  it("returns null name when address is null", () => {
    const { result } = renderHook(() => useCharacterName(null), { wrapper });
    expect(result.current.name).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mocked).not.toHaveBeenCalled();
  });

  it("resolves name for valid address", async () => {
    mocked.mockResolvedValue({
      address: "0xabc", name: "DarkPilot", characterObjectId: "0xobj", resolvedAt: Date.now(),
    });
    const { result } = renderHook(() => useCharacterName("0xabc"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBe("DarkPilot");
    expect(result.current.isError).toBe(false);
  });

  it("returns null name for unresolvable address", async () => {
    mocked.mockResolvedValue({
      address: "0xunknown", name: null, characterObjectId: null, resolvedAt: 0,
    });
    const { result } = renderHook(() => useCharacterName("0xunknown"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBeNull();
  });

  it("returns isError=true on API failure", async () => {
    mocked.mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() => useCharacterName("0xfail"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.name).toBeNull();
  });
});

describe("useCharacterNames", () => {
  it("returns empty map for empty array", () => {
    const { result } = renderHook(() => useCharacterNames([]), { wrapper });
    expect(result.current.size).toBe(0);
  });

  it("resolves multiple addresses with dedup", async () => {
    mocked.mockImplementation(async (addr) => ({
      address: addr, name: `Name-${addr.slice(-3)}`, characterObjectId: null, resolvedAt: Date.now(),
    }));
    const addrs = ["0xaaa", "0xbbb", "0xaaa"];
    const { result } = renderHook(() => useCharacterNames(addrs), { wrapper });
    await waitFor(() => {
      const entries = Array.from(result.current.values());
      return entries.every((v) => !v.isLoading);
    });
    expect(result.current.size).toBe(2); // deduped
    expect(result.current.get("0xaaa")?.name).toBe("Name-aaa");
    expect(result.current.get("0xbbb")?.name).toBe("Name-bbb");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-character.test.ts`
Expected: FAIL — module `use-character` not found

- [ ] **Step 3: Implement hook**

Create `src/hooks/use-character.ts`:

```ts
"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { getCharacter } from "@/lib/api-client";
import { useMemo } from "react";

const CHARACTER_STALE_TIME = 24 * 60 * 60 * 1000;

export function useCharacterName(address: string | null) {
  const query = useQuery({
    queryKey: ["character", address],
    queryFn: () => getCharacter(address!),
    enabled: !!address,
    staleTime: CHARACTER_STALE_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    name: query.data?.name ?? null,
    isLoading: !!address && query.isLoading,
    isError: query.isError,
  };
}

export function useCharacterNames(addresses: string[]) {
  const unique = useMemo(() => [...new Set(addresses)], [addresses]);

  const queries = useQueries({
    queries: unique.map((addr) => ({
      queryKey: ["character", addr],
      queryFn: () => getCharacter(addr),
      staleTime: CHARACTER_STALE_TIME,
      refetchOnWindowFocus: false,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, { name: string | null; isLoading: boolean }>();
    unique.forEach((addr, i) => {
      map.set(addr, {
        name: queries[i]?.data?.name ?? null,
        isLoading: queries[i]?.isLoading ?? false,
      });
    });
    return map;
  }, [unique, queries]);
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-character.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/hooks/use-character.ts next-monorepo/app/src/__tests__/hooks/use-character.test.ts
git commit -m "feat(eve-eyes): add useCharacterName + useCharacterNames hooks"
```

---

### Task 4: `CharacterName` Component

**Files:**
- Create: `src/components/CharacterName.tsx`

- [ ] **Step 1: Implement component**

Create `src/components/CharacterName.tsx`:

```tsx
"use client";

import { useCharacterName } from "@/hooks/use-character";

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
  const { name, isLoading } = useCharacterName(address);
  const truncated = truncateAddr(address, truncateLength);

  if (isLoading) {
    return (
      <span
        className={`inline-block bg-eve-panel-border/30 animate-pulse rounded-sm ${className}`}
        style={{ width: `${truncateLength * 2 + 4}ch`, height: "1em" }}
      />
    );
  }

  if (name) {
    return (
      <span className={`text-eve-gold ${className}`} title={address}>
        {name}
        {showAddress && (
          <span className="text-eve-muted text-[0.6rem] ml-1">({truncated})</span>
        )}
      </span>
    );
  }

  return <span className={`text-eve-muted font-mono ${className}`}>{truncated}</span>;
}
```

- [ ] **Step 2: Type-check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/components/CharacterName.tsx
git commit -m "feat(eve-eyes): add CharacterName component with loading + resolve states"
```

---

### Task 5: `RegionActivityPanel` Component

**Files:**
- Create: `src/components/RegionActivityPanel.tsx`

- [ ] **Step 1: Implement component**

Create `src/components/RegionActivityPanel.tsx`:

```tsx
"use client";

import { useRegionActivity } from "@/hooks/use-region-activity";
import { Panel } from "@/components/ui/Panel";
import { MetricChip } from "@/components/ui/MetricChip";
import type { RegionActivity } from "@/types";

interface RegionActivityPanelProps {
  regionId: number | null;
  compact?: boolean;
}

function formatTimeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

function ActivityBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.61rem] text-eve-muted uppercase tracking-wide">{label}</span>
        <span className="text-[0.61rem] text-eve-cold font-mono">{pct}</span>
      </div>
      <div className="h-1.5 bg-[rgba(8,11,16,0.84)] border border-eve-panel-border/30">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CompactView({ activity, regionId }: { activity: RegionActivity | null; regionId: number }) {
  if (!activity) return null;
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <MetricChip label="Defense" value={String(activity.defenseIndex)} />
      <MetricChip label="Infra" value={String(activity.infraIndex)} />
      <MetricChip label="Traffic" value={String(activity.trafficIndex)} />
      <MetricChip label="Players" value={String(activity.activePlayers)} />
      <span className="text-[0.55rem] text-eve-muted/60 ml-auto">
        R-{regionId} | {formatTimeAgo(activity.updatedAt)}
      </span>
    </div>
  );
}

export function RegionActivityPanel({ regionId, compact = false }: RegionActivityPanelProps) {
  const { activity, heatmap, isLoading, isStale } = useRegionActivity(regionId);

  if (compact) {
    return <CompactView activity={activity} regionId={regionId ?? 0} />;
  }

  return (
    <Panel title="REGION ACTIVITY" badge={regionId != null ? `R-${regionId}` : undefined}>
      {isLoading ? (
        <p className="mt-2 text-[0.73rem] text-eve-muted/80 animate-pulse">Loading activity data...</p>
      ) : !activity ? (
        <p className="mt-2 text-[0.73rem] text-eve-muted/60">No activity data available.</p>
      ) : (
        <div className="mt-2 grid gap-2">
          <ActivityBar label="Defense" value={activity.defenseIndex} color="bg-red-500/70" />
          <ActivityBar label="Infrastructure" value={activity.infraIndex} color="bg-eve-cyan/70" />
          <ActivityBar label="Traffic" value={activity.trafficIndex} color="bg-eve-gold/70" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[0.66rem] text-eve-cold">
              {activity.activePlayers} active player{activity.activePlayers !== 1 ? "s" : ""}
            </span>
            <span className={`text-[0.55rem] ${isStale ? "text-eve-warn animate-flicker" : "text-eve-muted/60"}`}>
              {isStale ? "STALE — " : ""}{formatTimeAgo(activity.updatedAt)}
            </span>
          </div>
          {heatmap && (
            <div className="flex gap-3 text-[0.6rem] text-eve-muted/60 border-t border-eve-panel-border/20 pt-1.5 mt-0.5">
              <span>{heatmap.totalReports} reports</span>
              <span>{heatmap.reporterCount} reporters</span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/components/RegionActivityPanel.tsx
git commit -m "feat(eve-eyes): add RegionActivityPanel with full + compact modes"
```

---

### Task 6: Map Page Integration

**Files:**
- Modify: `src/app/map/page.tsx`

- [ ] **Step 1: Add imports and parse regionId from selection**

At top of `map/page.tsx`, add imports:

```ts
import { RegionActivityPanel } from "@/components/RegionActivityPanel";
```

Add a helper to parse regionId from the `selected` state (format: `"${regionId}-${index}"`):

```ts
function parseRegionId(selected: string | null): number | null {
  if (!selected) return null;
  const n = parseInt(selected.split("-")[0]!, 10);
  return isNaN(n) ? null : n;
}
```

- [ ] **Step 2: Add compact overview in map controls area**

After the `</Panel>` that closes "Map Controls" and before the "Map View" `<Panel>`, add:

```tsx
{/* Region Activity Overview */}
<div className="border border-eve-panel-border/30 bg-eve-panel/50 p-2">
  <RegionActivityPanel regionId={parseRegionId(selected) ?? 0} compact />
</div>
```

Note: Uses `parseRegionId(selected) ?? 0` — shows region 0 (global) when nothing selected.

- [ ] **Step 3: Add full panel in sidebar**

In the sidebar column, after the "Selected Intel" `<Panel>`, add:

```tsx
<RegionActivityPanel regionId={parseRegionId(selected)} />
```

This shows full activity panel only when a cell is selected (null = nothing rendered via Panel).

- [ ] **Step 4: Type-check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/app/map/page.tsx
git commit -m "feat(eve-eyes): integrate RegionActivityPanel into map page"
```

---

### Task 7: Bounty Detail Integration (CharacterName)

**Files:**
- Modify: `src/components/bounty/ProofTimeline.tsx` (lines 57-59)
- Modify: `src/components/bounty/ClaimTicketList.tsx` (lines 20-24)

- [ ] **Step 1: Update ProofTimeline**

In `ProofTimeline.tsx`, add import at top:

```ts
import { CharacterName } from "@/components/CharacterName";
```

Replace line 57-59 (the address truncation paragraph):

```tsx
// Before:
<p className="text-[0.66rem] text-eve-muted mt-0.5">
  Hunter: {ev.hunter.slice(0, 10)}...{ev.hunter.slice(-6)}
  {ev.actor && ` | Actor: ${ev.actor.slice(0, 10)}...${ev.actor.slice(-6)}`}
</p>

// After:
<p className="text-[0.66rem] text-eve-muted mt-0.5">
  Hunter: <CharacterName address={ev.hunter} className="text-[0.66rem]" />
  {ev.actor && (
    <> | Actor: <CharacterName address={ev.actor} className="text-[0.66rem]" /></>
  )}
</p>
```

- [ ] **Step 2: Update ClaimTicketList**

In `ClaimTicketList.tsx`, add `"use client"` directive at the very top (currently missing, needed for consistency since it now uses a client component), then add import:

```ts
"use client";

import { CharacterName } from "@/components/CharacterName";
```

Replace lines 20-24 (the address span inside the list item):

```tsx
// Before:
<span className="text-xs font-mono truncate max-w-[160px]">
  {h.hunter.slice(0, 10)}...{h.hunter.slice(-6)}
  {h.hunter === currentAddress && (
    <span className="text-eve-gold ml-1">(you)</span>
  )}
</span>

// After:
<span className="text-xs truncate max-w-[200px]">
  <CharacterName address={h.hunter} className="text-xs" />
  {h.hunter === currentAddress && (
    <span className="text-eve-gold ml-1">(you)</span>
  )}
</span>
```

- [ ] **Step 3: Type-check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add next-monorepo/app/src/components/bounty/ProofTimeline.tsx next-monorepo/app/src/components/bounty/ClaimTicketList.tsx
git commit -m "feat(eve-eyes): integrate CharacterName into bounty detail components"
```

---

### Task 8: Monkey Tests

**Files:**
- Create: `src/__tests__/monkey/eve-eyes-monkey.test.ts`

- [ ] **Step 1: Write monkey tests**

Create `src/__tests__/monkey/eve-eyes-monkey.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  getRegionSummary: vi.fn(),
  getCharacter: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, isPremium: false }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRegionActivity } from "@/hooks/use-region-activity";
import { useCharacterName, useCharacterNames } from "@/hooks/use-character";
import { getRegionSummary, getCharacter } from "@/lib/api-client";

const mockedRegion = vi.mocked(getRegionSummary);
const mockedChar = vi.mocked(getCharacter);

beforeEach(() => { mockedRegion.mockReset(); mockedChar.mockReset(); });

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("EVE EYES monkey tests", () => {
  it("useRegionActivity handles NaN regionId gracefully", () => {
    // NaN should not trigger a fetch
    const { result } = renderHook(() => useRegionActivity(NaN), { wrapper });
    // NaN != null is true, but queryFn will get NaN — hook should guard
    // This tests that the hook doesn't crash
    expect(result.current.activity).toBeNull();
  });

  it("useRegionActivity handles negative regionId", async () => {
    mockedRegion.mockResolvedValue({
      regionId: -1,
      heatmap: { totalReports: 0, reporterCount: 0 },
      activity: null,
    });
    const { result } = renderHook(() => useRegionActivity(-1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activity).toBeNull();
  });

  it("useCharacterName handles empty string address", () => {
    const { result } = renderHook(() => useCharacterName(""), { wrapper });
    expect(result.current.name).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(mockedChar).not.toHaveBeenCalled();
  });

  it("useCharacterNames handles 50 addresses without crashing", async () => {
    mockedChar.mockImplementation(async (addr) => ({
      address: addr, name: `N-${addr}`, characterObjectId: null, resolvedAt: Date.now(),
    }));
    const addrs = Array.from({ length: 50 }, (_, i) => `0x${i.toString(16).padStart(40, "0")}`);
    const { result } = renderHook(() => useCharacterNames(addrs), { wrapper });
    await waitFor(() => {
      const entries = Array.from(result.current.values());
      return entries.length === 50 && entries.every((v) => !v.isLoading);
    });
    expect(result.current.size).toBe(50);
  });

  it("useCharacterNames handles all-duplicate array", async () => {
    mockedChar.mockResolvedValue({
      address: "0xsame", name: "Same", characterObjectId: null, resolvedAt: Date.now(),
    });
    const addrs = Array(10).fill("0xsame");
    const { result } = renderHook(() => useCharacterNames(addrs), { wrapper });
    await waitFor(() => !result.current.get("0xsame")?.isLoading);
    expect(result.current.size).toBe(1);
    expect(mockedChar).toHaveBeenCalledTimes(1); // dedup
  });

  it("useRegionActivity with extreme activity values", async () => {
    mockedRegion.mockResolvedValue({
      regionId: 1,
      heatmap: { totalReports: 999999, reporterCount: 0 },
      activity: {
        defenseIndex: 999, infraIndex: -5, trafficIndex: 0,
        activePlayers: 0, windowStart: 0, windowEnd: 0, updatedAt: 0,
      },
    });
    const { result } = renderHook(() => useRegionActivity(1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activity!.defenseIndex).toBe(999);
    expect(result.current.activity!.infraIndex).toBe(-5);
    expect(result.current.isStale).toBe(true); // updatedAt=0 is ancient
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/monkey/eve-eyes-monkey.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 3: Run full test suite**

Run: `cd next-monorepo/app && npx vitest run`
Expected: all tests PASS (existing + new)

- [ ] **Step 4: Final type-check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/__tests__/monkey/eve-eyes-monkey.test.ts
git commit -m "test(eve-eyes): add monkey tests for hooks edge cases"
```
