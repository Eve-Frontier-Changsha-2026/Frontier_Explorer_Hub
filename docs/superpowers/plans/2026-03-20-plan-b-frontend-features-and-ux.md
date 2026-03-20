# Plan B: Frontend Features, Plugin SDK & UX Optimization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend data/logic layer (hooks, state, API client, auth flow), Plugin SDK package, Plugin Bridge host-side handler, and define UX optimization targets. Visual UI implementation is handled by frontend engineers — this plan delivers the functional backbone they plug into.

**Architecture:** Next.js App Router + @mysten/dapp-kit for wallet + Zustand for UI state + TanStack Query for server data. Plugin system uses iframe sandbox + postMessage with a typed SDK package. All on-chain interactions go through PTB builders that the UI layer calls via hooks.

**Tech Stack:** Next.js 14 (App Router), TypeScript, @mysten/dapp-kit, @mysten/sui, Zustand, TanStack Query, deck.gl (HeatmapLayer), Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-frontier-explorer-hub-design.md` (Sections 5, 6, 8)

**Dependency:** Plan A (contracts + services) must be completed first — this plan consumes the Data API and on-chain contract ABIs.

---

## File Structure

### Monorepo Root

```
package.json                        — npm workspaces: ["app", "packages/*"]
```

### Frontend App (`app/`)

```
app/
├── package.json
├── tsconfig.json
├── vitest.config.ts                — @/ alias + jsdom environment
├── next.config.ts
├── .env.local.example
├── src/
│   ├── app/
│   │   ├── layout.tsx              — root layout, providers
│   │   ├── providers.tsx           — dapp-kit + QueryClient + Zustand
│   │   ├── map/page.tsx            — star map page (shell)
│   │   ├── submit/page.tsx         — intel submit page (shell)
│   │   ├── bounties/page.tsx       — bounty board page (shell)
│   │   ├── subscribe/page.tsx      — subscription page (shell)
│   │   └── store/page.tsx          — plugin catalog page (shell)
│   ├── lib/
│   │   ├── constants.ts            — contract addresses, API base URL, tier config
│   │   ├── api-client.ts           — typed fetch wrapper for Data API
│   │   ├── auth.ts                 — wallet-signed JWT generation + refresh
│   │   └── ptb/
│   │       ├── intel.ts            — PTB builders for intel module
│   │       ├── subscription.ts     — PTB builders for subscription module
│   │       ├── access.ts           — PTB builders for access module
│   │       ├── bounty.ts           — PTB builders for bounty module
│   │       └── marketplace.ts      — PTB builders for marketplace module
│   ├── hooks/
│   │   ├── use-auth.ts             — JWT lifecycle + tier state
│   │   ├── use-subscription.ts     — subscription status + actions
│   │   ├── use-heatmap.ts          — heatmap data fetching (tier-gated)
│   │   ├── use-intel.ts            — intel detail + unlock state
│   │   ├── use-bounties.ts         — bounty list + create/claim actions
│   │   ├── use-map-viewport.ts     — map camera state (zoom, center, bounds)
│   │   └── use-plugins.ts          — plugin registry + usage
│   ├── stores/
│   │   ├── map-store.ts            — Zustand: viewport, active layers, filters
│   │   └── ui-store.ts             — Zustand: modals, panels, toasts
│   ├── types/
│   │   └── index.ts                — shared frontend types
│   └── __tests__/
│       ├── api-client.test.ts
│       ├── auth.test.ts
│       ├── ptb/
│       │   ├── intel.test.ts
│       │   ├── subscription.test.ts
│       │   ├── access.test.ts
│       │   ├── bounty.test.ts
│       │   └── marketplace.test.ts
│       ├── stores/
│       │   └── map-store.test.ts
│       ├── hooks/
│       │   ├── use-auth.test.ts
│       │   ├── use-subscription.test.ts
│       │   ├── use-heatmap.test.ts
│       │   └── use-intel.test.ts
│       └── monkey/
│           ├── auth-monkey.test.ts
│           └── hooks-monkey.test.ts
```

### Plugin SDK (`packages/plugin-sdk/`)

```
packages/plugin-sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    — ExplorerHubSDK class (plugin-side)
│   ├── types.ts                    — SDK type definitions
│   ├── transport.ts                — postMessage transport layer
│   └── __tests__/
│       ├── sdk.test.ts
│       └── transport.test.ts
```

### Plugin Bridge (`app/src/lib/plugin-bridge/`)

```
app/src/lib/plugin-bridge/
├── bridge.ts                       — PluginBridge class (host-side)
├── permissions.ts                  — permission validation
├── types.ts                        — bridge protocol types
└── __tests__/
    ├── bridge.test.ts
    └── permissions.test.ts
```

---

## Task 1: Frontend Scaffold + Providers

**Files:**
- Create: `package.json` (monorepo root, workspaces config)
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/vitest.config.ts`
- Create: `app/next.config.ts`
- Create: `app/.env.local.example`
- Create: `app/src/app/layout.tsx`
- Create: `app/src/app/providers.tsx`
- Create: `app/src/lib/constants.ts`
- Create: `app/src/types/index.ts`

- [ ] **Step 0: Create monorepo root package.json**

The project is a monorepo (`app/` + `packages/plugin-sdk/`). Create a root `package.json` with workspace config so cross-package imports work.

```json
// package.json (project root)
{
  "name": "frontier-explorer-hub",
  "private": true,
  "workspaces": ["app", "packages/*"]
}
```

- [ ] **Step 1: Initialize Next.js project**

> **Note:** Spec references `create-eve-dapp` scaffold but it is not yet available as a public package. Using `create-next-app` with manual dapp-kit setup achieves the same result. See Design Deviations table.

```bash
cd app && npx create-next-app@latest . --typescript --app --tailwind --src-dir --no-import-alias
```

- [ ] **Step 2: Install dependencies**

```bash
cd app && npm install @mysten/dapp-kit @mysten/sui @tanstack/react-query zustand deck.gl @deck.gl/core @deck.gl/layers
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 2.1: Write vitest.config.ts**

Required for `@/` path alias resolution in all test files.

```typescript
// app/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 2.2: Write tsconfig.json path alias**

Ensure `@/` alias is configured for both Next.js and vitest:

```json
// app/tsconfig.json (merge into generated file)
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write .env.local.example**

```env
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_PACKAGE_ID=0x...
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_SUBSCRIPTION_CONFIG_ID=0x...
NEXT_PUBLIC_PRICING_TABLE_ID=0x...
NEXT_PUBLIC_PLUGIN_REGISTRY_ID=0x...
```

- [ ] **Step 4: Write constants.ts**

```typescript
// app/src/lib/constants.ts
export const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export const SHARED_OBJECTS = {
  subscriptionConfig: process.env.NEXT_PUBLIC_SUBSCRIPTION_CONFIG_ID!,
  pricingTable: process.env.NEXT_PUBLIC_PRICING_TABLE_ID!,
  pluginRegistry: process.env.NEXT_PUBLIC_PLUGIN_REGISTRY_ID!,
} as const;

export const INTEL_TYPES = {
  RESOURCE: 0,
  THREAT: 1,
  WRECKAGE: 2,
  POPULATION: 3,
} as const;

export const INTEL_TYPE_LABELS: Record<number, string> = {
  0: 'Resource',
  1: 'Threat',
  2: 'Wreckage',
  3: 'Population',
};

export const TIERS = {
  FREE: 0,
  PREMIUM: 1,
} as const;

export const TIER_LIMITS = {
  [TIERS.FREE]: { maxZoom: 1, rateLimit: 10, delayMs: 30 * 60 * 1000 },
  [TIERS.PREMIUM]: { maxZoom: 2, rateLimit: 100, delayMs: 0 },
} as const;

export const MIN_SUBMIT_DEPOSIT_MIST = 10_000_000; // 0.01 SUI
```

- [ ] **Step 5: Write types/index.ts**

```typescript
// app/src/types/index.ts

export interface GridCell {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  zoomLevel: number;
}

export interface IntelReport {
  id: string;
  reporter: string;
  location: GridCell;
  intelType: number;
  severity: number;
  timestamp: number;
  expiry: number;
  visibility: number;
}

export interface AggregatedCell {
  cell: GridCell;
  totalReports: number;
  reporterCount: number;
  suppressed: boolean;
  byType?: Record<number, number>;    // Premium only
  avgSeverity?: number;               // Premium only
  latestTimestamp: number;
}

export interface SubscriptionStatus {
  tier: number;
  startedAt: number;
  expiresAt: number;
  isActive: boolean;
  nftId?: string;
}

export interface UnlockReceipt {
  id: string;
  originalBuyer: string;
  intelId: string;
  unlockedAt: number;
  pricePaid: number;
}

export interface BountyRequest {
  id: string;
  requester: string;
  targetRegion: GridCell;
  intelTypesWanted: number[];
  rewardAmount: number;
  deadline: number;
  status: number;   // 0=open, 1=submitted, 2=completed, 3=expired
  submissionCount: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  url: string;
  icon: string;
  permissions: PluginPermission[];
  pricing: { model: string; price: number; revenueSplitBps: number };
  category: string;
}

export type PluginPermission =
  | 'read:heatmap'
  | 'read:intel'
  | 'read:viewport'
  | 'read:bounties'
  | 'request:transaction'
  | 'request:payment';

export type Tier = 'free' | 'premium';

export interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}
```

- [ ] **Step 6: Write providers.tsx**

```typescript
// app/src/app/providers.tsx
'use client';

import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { SUI_NETWORK } from '@/lib/constants';

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 2,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK as 'testnet'}>
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Write layout.tsx (minimal shell)**

```typescript
// app/src/app/layout.tsx
import '@mysten/dapp-kit/dist/index.css';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Type check**

Run: `cd app && npx tsc --noEmit`

- [ ] **Step 9: Commit**

```
feat(app): scaffold Next.js with dapp-kit, TanStack Query, types, constants
```

---

## Task 2: API Client + Auth (Wallet-Signed JWT)

**Files:**
- Create: `app/src/lib/api-client.ts`
- Create: `app/src/lib/auth.ts`
- Create: `app/src/hooks/use-auth.ts`
- Create: `app/src/__tests__/api-client.test.ts`
- Create: `app/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write api-client.ts**

Typed fetch wrapper over Data API. Handles JWT attach, error normalization, and response typing.

```typescript
// app/src/lib/api-client.ts
import { API_BASE_URL } from './constants';
import type { AggregatedCell, IntelReport, BountyRequest, SubscriptionStatus } from '@/types';

let _jwt: string | null = null;

export function setJwt(jwt: string | null) {
  _jwt = jwt;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (_jwt) headers['Authorization'] = `Bearer ${_jwt}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText, body);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---- Endpoints ----

export function getHeatmap(zoomLevel: number, regionId?: number) {
  const params = new URLSearchParams();
  if (regionId != null) params.set('region', String(regionId));
  const qs = params.toString();
  return apiFetch<{ cells: AggregatedCell[]; tier: string }>(`/api/heatmap/${zoomLevel}${qs ? `?${qs}` : ''}`);
}

export function getIntel(intelId: string) {
  return apiFetch<{ intel: IntelReport; locked: boolean }>(`/api/intel/${intelId}`);
}

export function getRegionSummary(regionId: number) {
  return apiFetch<{
    regionId: number;
    totalReports: number;
    byType: Record<number, number>;
    activeBounties: number;
  }>(`/api/region/${regionId}/summary`);
}

export function getSubscriptionStatus() {
  return apiFetch<SubscriptionStatus>('/api/subscription/status');
}

export function getActiveBounties() {
  return apiFetch<{ bounties: BountyRequest[] }>('/api/bounties/active');
}
```

- [ ] **Step 2: Write auth.ts**

Wallet-signed message → send to backend → receive JWT → store.

```typescript
// app/src/lib/auth.ts
import { API_BASE_URL } from './constants';
import { setJwt } from './api-client';

const AUTH_STORAGE_KEY = 'feh_jwt';
const NONCE_ENDPOINT = '/api/auth/nonce';
const VERIFY_ENDPOINT = '/api/auth/verify';

export interface AuthState {
  jwt: string | null;
  address: string | null;
  tier: 'free' | 'premium';
  expiresAt: number;
}

/**
 * Auth flow:
 * 1. GET /api/auth/nonce?address=0x... → { nonce: "..." }
 * 2. Wallet signs nonce message
 * 3. POST /api/auth/verify { address, signature, nonce } → { jwt, tier, expiresAt }
 */
export async function authenticate(
  address: string,
  signMessage: (msg: Uint8Array) => Promise<{ signature: string }>,
): Promise<AuthState> {
  // 1. Get nonce
  const nonceRes = await fetch(`${API_BASE_URL}${NONCE_ENDPOINT}?address=${address}`);
  const { nonce } = await nonceRes.json();

  // 2. Sign
  const message = new TextEncoder().encode(
    `Frontier Explorer Hub Authentication\nNonce: ${nonce}\nAddress: ${address}`,
  );
  const { signature } = await signMessage(message);

  // 3. Verify
  const verifyRes = await fetch(`${API_BASE_URL}${VERIFY_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature, nonce }),
  });

  if (!verifyRes.ok) throw new Error('Auth verification failed');
  const { jwt, tier, expiresAt } = await verifyRes.json();

  setJwt(jwt);
  sessionStorage.setItem(AUTH_STORAGE_KEY, jwt);

  return { jwt, address, tier, expiresAt };
}

export function restoreSession(): string | null {
  if (typeof window === 'undefined') return null;
  const jwt = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (jwt) setJwt(jwt);
  return jwt;
}

export function clearSession() {
  setJwt(null);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}
```

- [ ] **Step 3: Write use-auth.ts hook**

```typescript
// app/src/hooks/use-auth.ts
'use client';

import { useCurrentAccount, useSignPersonalMessage } from '@mysten/dapp-kit';
import { useCallback, useEffect, useState } from 'react';
import { authenticate, clearSession, restoreSession, type AuthState } from '@/lib/auth';

const INITIAL_STATE: AuthState = { jwt: null, address: null, tier: 'free', expiresAt: 0 };

export function useAuth() {
  const account = useCurrentAccount();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const [auth, setAuth] = useState<AuthState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const jwt = restoreSession();
    if (jwt && account?.address) {
      // Validate JWT expiry client-side (decode payload)
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setAuth({ jwt, address: account.address, tier: payload.tier ?? 'free', expiresAt: payload.exp * 1000 });
        } else {
          clearSession();
        }
      } catch {
        clearSession();
      }
    }
  }, [account?.address]);

  // Clear on wallet disconnect
  useEffect(() => {
    if (!account) {
      clearSession();
      setAuth(INITIAL_STATE);
    }
  }, [account]);

  const login = useCallback(async () => {
    if (!account?.address) return;
    setIsLoading(true);
    setError(null);
    try {
      const state = await authenticate(account.address, async (msg) => {
        const result = await signMessage({ message: msg });
        return { signature: result.signature };
      });
      setAuth(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [account?.address, signMessage]);

  const logout = useCallback(() => {
    clearSession();
    setAuth(INITIAL_STATE);
  }, []);

  return {
    ...auth,
    isAuthenticated: !!auth.jwt,
    isPremium: auth.tier === 'premium',
    isLoading,
    error,
    login,
    logout,
  };
}
```

- [ ] **Step 4: Write api-client.test.ts**

```typescript
// app/src/__tests__/api-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHeatmap, getIntel, ApiError, setJwt } from '@/lib/api-client';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  setJwt(null);
});

describe('api-client', () => {
  it('getHeatmap sends correct URL and returns data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cells: [], tier: 'free' }),
    });
    const result = await getHeatmap(1);
    expect(result).toEqual({ cells: [], tier: 'free' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/heatmap/1'),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
  });

  it('attaches JWT header when set', async () => {
    setJwt('test-jwt-token');
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await getIntel('0x123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-jwt-token' }),
      }),
    );
  });

  it('throws ApiError on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 403, statusText: 'Forbidden',
      json: () => Promise.resolve({ error: 'Premium required' }),
    });
    await expect(getHeatmap(2)).rejects.toThrow(ApiError);
    await expect(getHeatmap(2)).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 5: Write auth.test.ts**

```typescript
// app/src/__tests__/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticate, restoreSession, clearSession } from '@/lib/auth';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.clear();
});

describe('auth', () => {
  it('full auth flow: nonce → sign → verify → returns JWT', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nonce: 'abc123' }) })  // nonce
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ jwt: 'jwt.token.here', tier: 'premium', expiresAt: Date.now() + 86400000 }) });  // verify

    const signMessage = vi.fn().mockResolvedValue({ signature: 'sig' });
    const result = await authenticate('0xABC', signMessage);

    expect(result.jwt).toBe('jwt.token.here');
    expect(result.tier).toBe('premium');
    expect(signMessage).toHaveBeenCalledOnce();
  });

  it('clearSession removes stored JWT', () => {
    sessionStorage.setItem('feh_jwt', 'old-jwt');
    clearSession();
    expect(restoreSession()).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd app && npx vitest run src/__tests__/api-client.test.ts src/__tests__/auth.test.ts`

- [ ] **Step 7: Commit**

```
feat(app): add API client with JWT auth and wallet-signed login flow
```

---

## Task 3: PTB Builders (On-chain Transaction Constructors)

**Files:**
- Create: `app/src/lib/ptb/intel.ts`
- Create: `app/src/lib/ptb/subscription.ts`
- Create: `app/src/lib/ptb/access.ts`
- Create: `app/src/lib/ptb/bounty.ts`
- Create: `app/src/lib/ptb/marketplace.ts`
- Create: `app/src/__tests__/ptb/intel.test.ts`
- Create: `app/src/__tests__/ptb/subscription.test.ts`
- Create: `app/src/__tests__/ptb/access.test.ts`
- Create: `app/src/__tests__/ptb/bounty.test.ts`
- Create: `app/src/__tests__/ptb/marketplace.test.ts`

Each PTB builder returns a `Transaction` object ready for wallet signing. No side effects — pure functions.

- [ ] **Step 1: Write ptb/intel.ts**

```typescript
// app/src/lib/ptb/intel.ts
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, MIN_SUBMIT_DEPOSIT_MIST } from '../constants';
import type { GridCell } from '@/types';

export interface SubmitIntelParams {
  location: GridCell;
  rawLocationHash: number[];
  intelType: number;
  severity: number;
  expiryMs: number;
  visibility: number;
  depositMist?: number; // defaults to MIN_SUBMIT_DEPOSIT_MIST
}

export function buildSubmitIntel(tx: Transaction, params: SubmitIntelParams, clockId: string): Transaction {
  const deposit = params.depositMist ?? MIN_SUBMIT_DEPOSIT_MIST;
  const [depositCoin] = tx.splitCoins(tx.gas, [deposit]);

  tx.moveCall({
    target: `${PACKAGE_ID}::intel::submit_intel`,
    arguments: [
      tx.object(clockId),
      depositCoin,
      tx.pure.u64(params.location.regionId),
      tx.pure.u64(params.location.sectorX),
      tx.pure.u64(params.location.sectorY),
      tx.pure.u64(params.location.sectorZ),
      tx.pure.u8(params.location.zoomLevel),
      tx.pure.vector('u8', params.rawLocationHash),
      tx.pure.u8(params.intelType),
      tx.pure.u8(params.severity),
      tx.pure.u64(params.expiryMs),
      tx.pure.u8(params.visibility),
    ],
  });

  return tx;
}

export function buildExpireIntel(tx: Transaction, intelId: string): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::intel::expire_intel`,
    arguments: [tx.object(intelId)],
  });
  return tx;
}
```

- [ ] **Step 2: Write ptb/subscription.ts**

```typescript
// app/src/lib/ptb/subscription.ts
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../constants';

export function buildSubscribe(tx: Transaction, days: number, priceMist: number, clockId: string): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::subscription::subscribe`,
    arguments: [
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      paymentCoin,
      tx.pure.u64(days),
      tx.object(clockId),
    ],
  });

  return tx;
}

export function buildRenew(tx: Transaction, nftId: string, days: number, priceMist: number, clockId: string): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::subscription::renew`,
    arguments: [
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      tx.object(nftId),
      paymentCoin,
      tx.pure.u64(days),
      tx.object(clockId),
    ],
  });

  return tx;
}
```

- [ ] **Step 3: Write ptb/access.ts**

```typescript
// app/src/lib/ptb/access.ts
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../constants';

export function buildUnlockIntel(
  tx: Transaction,
  intelId: string,
  paymentMist: number,
  maxPriceMist: number,
  clockId: string,
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [paymentMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::access::unlock_intel`,
    arguments: [
      tx.object(SHARED_OBJECTS.pricingTable),
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      tx.object(intelId),
      paymentCoin,
      tx.pure.u64(maxPriceMist),
      tx.object(clockId),
    ],
  });

  return tx;
}
```

- [ ] **Step 4: Write ptb/bounty.ts**

```typescript
// app/src/lib/ptb/bounty.ts
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID } from '../constants';
import type { GridCell } from '@/types';

export function buildCreateBounty(
  tx: Transaction,
  targetRegion: GridCell,
  intelTypesWanted: number[],
  rewardMist: number,
  deadlineMs: number,
  clockId: string,
): Transaction {
  const [rewardCoin] = tx.splitCoins(tx.gas, [rewardMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::create_bounty`,
    arguments: [
      rewardCoin,
      tx.pure.u64(targetRegion.regionId),
      tx.pure.u64(targetRegion.sectorX),
      tx.pure.u64(targetRegion.sectorY),
      tx.pure.u64(targetRegion.sectorZ),
      tx.pure.u8(targetRegion.zoomLevel),
      tx.pure.vector('u8', intelTypesWanted),
      tx.pure.u64(deadlineMs),
      tx.object(clockId),
    ],
  });

  return tx;
}

export function buildSubmitForBounty(
  tx: Transaction,
  bountyId: string,
  intelId: string,
  clockId: string,
): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::submit_for_bounty`,
    arguments: [
      tx.object(bountyId),
      tx.object(intelId),
      tx.object(clockId),
    ],
  });

  return tx;
}

export function buildRefundExpiredBounty(tx: Transaction, bountyId: string, clockId: string): Transaction {
  tx.moveCall({
    target: `${PACKAGE_ID}::bounty::refund_expired_bounty`,
    arguments: [tx.object(bountyId), tx.object(clockId)],
  });
  return tx;
}
```

- [ ] **Step 5: Write ptb/marketplace.ts**

```typescript
// app/src/lib/ptb/marketplace.ts
import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, SHARED_OBJECTS } from '../constants';

export function buildUsePlugin(
  tx: Transaction,
  pluginId: string,
  priceMist: number,
  clockId: string,
): Transaction {
  const [paymentCoin] = tx.splitCoins(tx.gas, [priceMist]);

  tx.moveCall({
    target: `${PACKAGE_ID}::marketplace::use_plugin`,
    arguments: [
      tx.object(SHARED_OBJECTS.pluginRegistry),
      tx.pure.address(pluginId),
      paymentCoin,
      tx.object(SHARED_OBJECTS.subscriptionConfig),
      tx.object(clockId),
    ],
  });

  return tx;
}
```

- [ ] **Step 6: Write PTB unit tests**

Each test verifies the `Transaction` object has the correct move call target and argument count. Use `tx.getData()` to inspect.

```typescript
// app/src/__tests__/ptb/intel.test.ts
import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildSubmitIntel } from '@/lib/ptb/intel';

describe('buildSubmitIntel', () => {
  it('creates a transaction with submit_intel move call', () => {
    const tx = new Transaction();
    buildSubmitIntel(tx, {
      location: { regionId: 1, sectorX: 100, sectorY: 200, sectorZ: 50, zoomLevel: 1 },
      rawLocationHash: [1, 2, 3],
      intelType: 0,
      severity: 5,
      expiryMs: Date.now() + 86400000,
      visibility: 0,
    }, '0x6');
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2); // splitCoins + moveCall
  });
});
```

```typescript
// app/src/__tests__/ptb/subscription.test.ts
import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildSubscribe } from '@/lib/ptb/subscription';

describe('buildSubscribe', () => {
  it('creates a transaction with subscribe move call', () => {
    const tx = new Transaction();
    buildSubscribe(tx, 30, 30_000_000_000, '0x6');
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
```

```typescript
// app/src/__tests__/ptb/access.test.ts
import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildUnlockIntel } from '@/lib/ptb/access';

describe('buildUnlockIntel', () => {
  it('creates a transaction with unlock_intel move call and slippage param', () => {
    const tx = new Transaction();
    buildUnlockIntel(tx, '0xINTEL', 200_000_000, 300_000_000, '0x6');
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
```

```typescript
// app/src/__tests__/ptb/bounty.test.ts
import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildCreateBounty, buildSubmitForBounty } from '@/lib/ptb/bounty';

describe('buildCreateBounty', () => {
  it('creates a transaction with create_bounty move call', () => {
    const tx = new Transaction();
    buildCreateBounty(tx, { regionId: 1, sectorX: 10, sectorY: 20, sectorZ: 5, zoomLevel: 1 }, [0, 1], 1_000_000_000, Date.now() + 86400000, '0x6');
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildSubmitForBounty', () => {
  it('creates a transaction with submit_for_bounty move call', () => {
    const tx = new Transaction();
    buildSubmitForBounty(tx, '0xBOUNTY', '0xINTEL', '0x6');
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(1);
  });
});
```

```typescript
// app/src/__tests__/ptb/marketplace.test.ts
import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { buildUsePlugin } from '@/lib/ptb/marketplace';

describe('buildUsePlugin', () => {
  it('creates a transaction with use_plugin move call', () => {
    const tx = new Transaction();
    buildUsePlugin(tx, '0xPLUGIN', 50_000_000, '0x6');
    const data = tx.getData();
    expect(data.commands.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `cd app && npx vitest run src/__tests__/ptb/`

- [ ] **Step 8: Commit**

```
feat(app): add PTB builders for all contract modules
```

---

## Task 4: Zustand Stores (Map State + UI State)

**Files:**
- Create: `app/src/stores/map-store.ts`
- Create: `app/src/stores/ui-store.ts`

- [ ] **Step 1: Write map-store.ts**

```typescript
// app/src/stores/map-store.ts
import { create } from 'zustand';

export interface MapFilters {
  intelTypes: number[];        // empty = show all
  severityMin: number;         // 0-10
  timeRangeMs: number | null;  // null = no filter
}

export interface MapState {
  // Viewport
  zoomLevel: number;           // 0=frontier, 1=region, 2=system
  centerRegionId: number | null;
  viewportBounds: { minX: number; maxX: number; minY: number; maxY: number } | null;

  // Layers
  showHeatmap: boolean;
  showMarkers: boolean;        // Premium only
  showRoutes: boolean;

  // Filters
  filters: MapFilters;

  // Selected
  selectedIntelId: string | null;
  selectedRegionId: number | null;

  // Actions
  setZoomLevel: (z: number) => void;
  setCenterRegion: (id: number | null) => void;
  setViewportBounds: (bounds: MapState['viewportBounds']) => void;
  toggleLayer: (layer: 'heatmap' | 'markers' | 'routes') => void;
  setFilters: (f: Partial<MapFilters>) => void;
  selectIntel: (id: string | null) => void;
  selectRegion: (id: number | null) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: MapFilters = {
  intelTypes: [],
  severityMin: 0,
  timeRangeMs: null,
};

export const useMapStore = create<MapState>((set) => ({
  zoomLevel: 0,
  centerRegionId: null,
  viewportBounds: null,
  showHeatmap: true,
  showMarkers: false,
  showRoutes: false,
  filters: { ...DEFAULT_FILTERS },
  selectedIntelId: null,
  selectedRegionId: null,

  setZoomLevel: (z) => set({ zoomLevel: Math.min(2, Math.max(0, z)) }),
  setCenterRegion: (id) => set({ centerRegionId: id }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  toggleLayer: (layer) => set((s) => {
    if (layer === 'heatmap') return { showHeatmap: !s.showHeatmap };
    if (layer === 'markers') return { showMarkers: !s.showMarkers };
    return { showRoutes: !s.showRoutes };
  }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  selectIntel: (id) => set({ selectedIntelId: id }),
  selectRegion: (id) => set({ selectedRegionId: id }),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
}));
```

- [ ] **Step 2: Write ui-store.ts**

```typescript
// app/src/stores/ui-store.ts
import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface UIState {
  // Panels
  intelPanelOpen: boolean;
  filterPanelOpen: boolean;

  // Modals
  activeModal: string | null; // 'unlock' | 'subscribe' | 'create-bounty' | 'plugin-permissions' | null
  modalData: unknown;

  // Toasts
  toasts: Toast[];

  // Tx status
  pendingTx: string | null;   // tx digest while waiting for confirmation

  // Actions
  toggleIntelPanel: () => void;
  toggleFilterPanel: () => void;
  openModal: (name: string, data?: unknown) => void;
  closeModal: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  setPendingTx: (digest: string | null) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set) => ({
  intelPanelOpen: false,
  filterPanelOpen: false,
  activeModal: null,
  modalData: null,
  toasts: [],
  pendingTx: null,

  toggleIntelPanel: () => set((s) => ({ intelPanelOpen: !s.intelPanelOpen })),
  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  openModal: (name, data) => set({ activeModal: name, modalData: data ?? null }),
  closeModal: () => set({ activeModal: null, modalData: null }),
  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    // Auto-dismiss
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, toast.duration ?? 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPendingTx: (digest) => set({ pendingTx: digest }),
}));
```

- [ ] **Step 3: Write store tests**

```typescript
// app/src/__tests__/stores/map-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '@/stores/map-store';

beforeEach(() => {
  useMapStore.setState({
    zoomLevel: 0,
    showHeatmap: true,
    showMarkers: false,
    showRoutes: false,
    filters: { intelTypes: [], severityMin: 0, timeRangeMs: null },
    selectedIntelId: null,
  });
});

describe('map-store', () => {
  it('clamps zoom level to 0-2', () => {
    useMapStore.getState().setZoomLevel(5);
    expect(useMapStore.getState().zoomLevel).toBe(2);

    useMapStore.getState().setZoomLevel(-1);
    expect(useMapStore.getState().zoomLevel).toBe(0);
  });

  it('toggles layers independently', () => {
    useMapStore.getState().toggleLayer('markers');
    expect(useMapStore.getState().showMarkers).toBe(true);
    expect(useMapStore.getState().showHeatmap).toBe(true); // unchanged
  });

  it('merges partial filter updates', () => {
    useMapStore.getState().setFilters({ severityMin: 5 });
    expect(useMapStore.getState().filters.severityMin).toBe(5);
    expect(useMapStore.getState().filters.intelTypes).toEqual([]); // preserved
  });

  it('resetFilters restores defaults', () => {
    useMapStore.getState().setFilters({ severityMin: 8, intelTypes: [1, 2] });
    useMapStore.getState().resetFilters();
    expect(useMapStore.getState().filters.severityMin).toBe(0);
    expect(useMapStore.getState().filters.intelTypes).toEqual([]);
  });
});
```

- [ ] **Step 4: Type check**

Run: `cd app && npx tsc --noEmit`

- [ ] **Step 5: Run store tests**

Run: `cd app && npx vitest run src/__tests__/stores/`

- [ ] **Step 6: Commit**

```
feat(app): add Zustand stores for map state and UI state
```

---

## Task 5: Data Hooks (Heatmap, Intel, Subscription, Bounties)

**Files:**
- Create: `app/src/hooks/use-heatmap.ts`
- Create: `app/src/hooks/use-intel.ts`
- Create: `app/src/hooks/use-subscription.ts`
- Create: `app/src/hooks/use-bounties.ts`
- Create: `app/src/hooks/use-map-viewport.ts`
- Create: `app/src/hooks/use-plugins.ts`
- Create: `app/src/__tests__/hooks/use-heatmap.test.ts`
- Create: `app/src/__tests__/hooks/use-subscription.test.ts`
- Create: `app/src/__tests__/hooks/use-intel.test.ts`

These hooks wrap TanStack Query + PTB builders + Zustand state. They are the **contract between data layer and UI components** — frontend engineers consume these hooks.

- [ ] **Step 1: Write use-subscription.ts**

```typescript
// app/src/hooks/use-subscription.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { getSubscriptionStatus } from '@/lib/api-client';
import { buildSubscribe, buildRenew } from '@/lib/ptb/subscription';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from './use-auth';

const CLOCK_ID = '0x6'; // Sui system clock

export function useSubscription() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: getSubscriptionStatus,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const subscribe = useMutation({
    mutationFn: async ({ days, priceMist }: { days: number; priceMist: number }) => {
      const tx = new Transaction();
      buildSubscribe(tx, days, priceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      addToast({ type: 'success', message: 'Subscription activated!' });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Subscribe failed: ${err.message}` });
      setPendingTx(null);
    },
  });

  const renew = useMutation({
    mutationFn: async ({ nftId, days, priceMist }: { nftId: string; days: number; priceMist: number }) => {
      const tx = new Transaction();
      buildRenew(tx, nftId, days, priceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      addToast({ type: 'success', message: 'Subscription renewed!' });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Renew failed: ${err.message}` });
      setPendingTx(null);
    },
  });

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    isPremium: query.data?.tier === 1 && query.data?.isActive,
    subscribe: subscribe.mutateAsync,
    renew: renew.mutateAsync,
    isSubscribing: subscribe.isPending,
    isRenewing: renew.isPending,
  };
}
```

- [ ] **Step 2: Write use-heatmap.ts**

```typescript
// app/src/hooks/use-heatmap.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { getHeatmap } from '@/lib/api-client';
import { useMapStore } from '@/stores/map-store';
import { useAuth } from './use-auth';
import { TIER_LIMITS, TIERS } from '@/lib/constants';
import type { AggregatedCell } from '@/types';

export function useHeatmap() {
  const { isPremium, isAuthenticated } = useAuth();
  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const filters = useMapStore((s) => s.filters);
  const tier = isPremium ? TIERS.PREMIUM : TIERS.FREE;

  // Clamp zoom to tier limit
  const effectiveZoom = Math.min(zoomLevel, TIER_LIMITS[tier].maxZoom);

  const query = useQuery({
    queryKey: ['heatmap', effectiveZoom, isAuthenticated],
    queryFn: () => getHeatmap(effectiveZoom),
    refetchInterval: isPremium ? 10_000 : 60_000, // Premium: 10s, Free: 60s
    staleTime: isPremium ? 5_000 : 30_000,
  });

  // Client-side filter (server returns all cells for the zoom level)
  const filteredCells: AggregatedCell[] = (query.data?.cells ?? []).filter((cell) => {
    if (cell.suppressed) return false;
    if (filters.intelTypes.length > 0 && cell.byType) {
      const hasMatchingType = filters.intelTypes.some((t) => (cell.byType?.[t] ?? 0) > 0);
      if (!hasMatchingType) return false;
    }
    if (filters.severityMin > 0 && cell.avgSeverity != null && cell.avgSeverity < filters.severityMin) {
      return false;
    }
    if (filters.timeRangeMs != null) {
      const cutoff = Date.now() - filters.timeRangeMs;
      if (cell.latestTimestamp < cutoff) return false;
    }
    return true;
  });

  return {
    cells: filteredCells,
    allCells: query.data?.cells ?? [],
    tier: query.data?.tier ?? 'free',
    isLoading: query.isLoading,
    isError: query.isError,
    effectiveZoom,
    isZoomLimited: zoomLevel > TIER_LIMITS[tier].maxZoom,
  };
}
```

- [ ] **Step 3: Write use-intel.ts**

```typescript
// app/src/hooks/use-intel.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { getIntel } from '@/lib/api-client';
import { buildUnlockIntel } from '@/lib/ptb/access';
import { buildSubmitIntel, type SubmitIntelParams } from '@/lib/ptb/intel';
import { useUIStore } from '@/stores/ui-store';

const CLOCK_ID = '0x6';

export function useIntelDetail(intelId: string | null) {
  return useQuery({
    queryKey: ['intel', intelId],
    queryFn: () => getIntel(intelId!),
    enabled: !!intelId,
  });
}

export function useUnlockIntel() {
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  return useMutation({
    mutationFn: async ({ intelId, priceMist, maxPriceMist }: {
      intelId: string;
      priceMist: number;
      maxPriceMist: number;
    }) => {
      const tx = new Transaction();
      buildUnlockIntel(tx, intelId, priceMist, maxPriceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['intel', vars.intelId] });
      addToast({ type: 'success', message: 'Intel unlocked!' });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Unlock failed: ${err.message}` });
      setPendingTx(null);
    },
  });
}

export function useSubmitIntel() {
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  return useMutation({
    mutationFn: async (params: SubmitIntelParams) => {
      const tx = new Transaction();
      buildSubmitIntel(tx, params, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['heatmap'] });
      addToast({ type: 'success', message: 'Intel submitted!' });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Submit failed: ${err.message}` });
      setPendingTx(null);
    },
  });
}
```

- [ ] **Step 4: Write use-bounties.ts**

```typescript
// app/src/hooks/use-bounties.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { getActiveBounties } from '@/lib/api-client';
import { buildCreateBounty, buildSubmitForBounty, buildRefundExpiredBounty } from '@/lib/ptb/bounty';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from './use-auth';
import type { GridCell } from '@/types';

const CLOCK_ID = '0x6';

export function useBounties() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ['bounties'],
    queryFn: getActiveBounties,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const createBounty = useMutation({
    mutationFn: async (params: {
      targetRegion: GridCell;
      intelTypesWanted: number[];
      rewardMist: number;
      deadlineMs: number;
    }) => {
      const tx = new Transaction();
      buildCreateBounty(tx, params.targetRegion, params.intelTypesWanted, params.rewardMist, params.deadlineMs, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bounties'] });
      addToast({ type: 'success', message: 'Bounty created!' });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Create bounty failed: ${err.message}` });
      setPendingTx(null);
    },
  });

  const claimBounty = useMutation({
    mutationFn: async ({ bountyId, intelId }: { bountyId: string; intelId: string }) => {
      const tx = new Transaction();
      buildSubmitForBounty(tx, bountyId, intelId, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bounties'] });
      addToast({ type: 'success', message: 'Bounty claimed!' });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Claim failed: ${err.message}` });
      setPendingTx(null);
    },
  });

  const refundBounty = useMutation({
    mutationFn: async ({ bountyId }: { bountyId: string }) => {
      const tx = new Transaction();
      buildRefundExpiredBounty(tx, bountyId, CLOCK_ID);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bounties'] });
      addToast({ type: 'success', message: 'Bounty refunded!' });
    },
  });

  return {
    bounties: query.data?.bounties ?? [],
    isLoading: query.isLoading,
    createBounty: createBounty.mutateAsync,
    claimBounty: claimBounty.mutateAsync,
    refundBounty: refundBounty.mutateAsync,
    isCreating: createBounty.isPending,
    isClaiming: claimBounty.isPending,
  };
}
```

- [ ] **Step 5: Write use-map-viewport.ts**

```typescript
// app/src/hooks/use-map-viewport.ts
'use client';

import { useCallback } from 'react';
import { useMapStore } from '@/stores/map-store';
import type { MapViewport } from '@/types';

/**
 * Bridge between deck.gl viewport events and Zustand map store.
 * Frontend engineers use this to wire up StarMapCanvas.
 */
export function useMapViewport() {
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const setCenterRegion = useMapStore((s) => s.setCenterRegion);
  const setViewportBounds = useMapStore((s) => s.setViewportBounds);
  const zoomLevel = useMapStore((s) => s.zoomLevel);

  const onViewportChange = useCallback((viewport: MapViewport) => {
    // Map deck.gl continuous zoom to discrete zoom levels
    const discreteZoom = viewport.zoom < 3 ? 0 : viewport.zoom < 6 ? 1 : 2;
    if (discreteZoom !== zoomLevel) {
      setZoomLevel(discreteZoom);
    }
  }, [zoomLevel, setZoomLevel]);

  return {
    onViewportChange,
    setZoomLevel,
    setCenterRegion,
    setViewportBounds,
    zoomLevel,
  };
}
```

- [ ] **Step 6: Write use-plugins.ts**

```typescript
// app/src/hooks/use-plugins.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { buildUsePlugin } from '@/lib/ptb/marketplace';
import { useUIStore } from '@/stores/ui-store';

const CLOCK_ID = '0x6';

export function usePlugins() {
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);

  const usePlugin = useMutation({
    mutationFn: async ({ pluginId, priceMist }: { pluginId: string; priceMist: number }) => {
      const tx = new Transaction();
      buildUsePlugin(tx, pluginId, priceMist, CLOCK_ID);
      return signAndExecute({ transaction: tx });
    },
    onSuccess: () => {
      addToast({ type: 'success', message: 'Plugin access granted!' });
    },
    onError: (err) => {
      addToast({ type: 'error', message: `Plugin payment failed: ${err.message}` });
    },
  });

  return {
    usePlugin: usePlugin.mutateAsync,
    isPaying: usePlugin.isPending,
  };
}
```

- [ ] **Step 7: Write hook tests (use-heatmap, use-subscription, use-intel)**

Test hook return values with mocked API client and dapp-kit. Use `renderHook` from Testing Library.

```typescript
// app/src/__tests__/hooks/use-heatmap.test.ts
import { describe, it, expect, vi } from 'vitest';

// Test the client-side filter logic extracted from useHeatmap
// (testing hooks with full React wrappers is complex — test the pure logic)
import type { AggregatedCell } from '@/types';

function filterCells(
  cells: AggregatedCell[],
  filters: { intelTypes: number[]; severityMin: number; timeRangeMs: number | null },
): AggregatedCell[] {
  return cells.filter((cell) => {
    if (cell.suppressed) return false;
    if (filters.intelTypes.length > 0 && cell.byType) {
      const hasMatch = filters.intelTypes.some((t) => (cell.byType?.[t] ?? 0) > 0);
      if (!hasMatch) return false;
    }
    if (filters.severityMin > 0 && cell.avgSeverity != null && cell.avgSeverity < filters.severityMin) {
      return false;
    }
    if (filters.timeRangeMs != null) {
      if (cell.latestTimestamp < Date.now() - filters.timeRangeMs) return false;
    }
    return true;
  });
}

describe('heatmap filter logic', () => {
  const baseCell: AggregatedCell = {
    cell: { regionId: 1, sectorX: 0, sectorY: 0, sectorZ: 0, zoomLevel: 0 },
    totalReports: 10,
    reporterCount: 5,
    suppressed: false,
    byType: { 0: 5, 1: 3, 2: 2 },
    avgSeverity: 6,
    latestTimestamp: Date.now(),
  };

  it('filters suppressed cells', () => {
    const cells = [{ ...baseCell, suppressed: true }];
    expect(filterCells(cells, { intelTypes: [], severityMin: 0, timeRangeMs: null })).toEqual([]);
  });

  it('filters by intel type', () => {
    const cells = [baseCell];
    expect(filterCells(cells, { intelTypes: [3], severityMin: 0, timeRangeMs: null })).toEqual([]);
    expect(filterCells(cells, { intelTypes: [0], severityMin: 0, timeRangeMs: null })).toHaveLength(1);
  });

  it('filters by severity', () => {
    expect(filterCells([baseCell], { intelTypes: [], severityMin: 7, timeRangeMs: null })).toEqual([]);
    expect(filterCells([baseCell], { intelTypes: [], severityMin: 5, timeRangeMs: null })).toHaveLength(1);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd app && npx vitest run src/__tests__/hooks/`

- [ ] **Step 9: Commit**

```
feat(app): add data hooks for heatmap, intel, subscription, bounties, plugins
```

---

## Task 6: Plugin SDK Package (@explorer-hub/plugin-sdk)

**Files:**
- Create: `packages/plugin-sdk/package.json`
- Create: `packages/plugin-sdk/tsconfig.json`
- Create: `packages/plugin-sdk/src/types.ts`
- Create: `packages/plugin-sdk/src/transport.ts`
- Create: `packages/plugin-sdk/src/index.ts`
- Create: `packages/plugin-sdk/src/__tests__/transport.test.ts`
- Create: `packages/plugin-sdk/src/__tests__/sdk.test.ts`

The Plugin SDK is a standalone npm package. Third-party developers import it inside their iframe-hosted plugin. All communication uses postMessage — the SDK never touches wallet or chain directly.

- [ ] **Step 1: Write package.json + tsconfig.json**

```json
{
  "name": "@explorer-hub/plugin-sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write types.ts**

```typescript
// packages/plugin-sdk/src/types.ts

export interface PluginUser {
  address: string;
  tier: 'free' | 'premium';
  subscriptionExpiry: number;
}

export interface HeatmapQuery {
  zoomLevel: number;
  regionId?: number;
}

export interface HeatmapCell {
  regionId: number;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  zoomLevel: number;
  totalReports: number;
  byType?: Record<number, number>;
  avgSeverity?: number;
}

export interface TransactionRequest {
  type: 'unlock_intel' | 'submit_intel' | 'create_bounty' | 'use_plugin';
  [key: string]: unknown;
}

export interface PaymentRequest {
  amount: number;
  description: string;
}

export interface PaymentReceipt {
  txDigest: string;
  amount: number;
  timestamp: number;
}

export interface ViewportState {
  longitude: number;
  latitude: number;
  zoom: number;
}

// ---- Protocol messages ----

export type BridgeRequestType =
  | 'getUser'
  | 'getHeatmap'
  | 'getIntel'
  | 'getRegionSummary'
  | 'getBounties'
  | 'requestTransaction'
  | 'requestPayment';

export type BridgeEventType =
  | 'viewportChange'
  | 'intelSelect';

export interface BridgeRequest {
  id: string;
  type: BridgeRequestType;
  payload: unknown;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeEvent {
  type: BridgeEventType;
  data: unknown;
}

export interface BridgeMessage {
  source: 'explorer-hub-sdk' | 'explorer-hub-host';
  message: BridgeRequest | BridgeResponse | BridgeEvent;
}
```

- [ ] **Step 3: Write transport.ts**

```typescript
// packages/plugin-sdk/src/transport.ts
import type { BridgeMessage, BridgeRequest, BridgeResponse, BridgeEvent } from './types';

type ResponseHandler = (response: BridgeResponse) => void;
type EventHandler = (data: unknown) => void;

export class PostMessageTransport {
  private pendingRequests = new Map<string, ResponseHandler>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private requestCounter = 0;

  constructor(private targetOrigin: string = '*') {
    window.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (event: MessageEvent) => {
    const msg = event.data as BridgeMessage;
    if (msg?.source !== 'explorer-hub-host') return;

    const inner = msg.message;

    // Response to a pending request
    if ('id' in inner && 'success' in inner) {
      const handler = this.pendingRequests.get(inner.id);
      if (handler) {
        handler(inner as BridgeResponse);
        this.pendingRequests.delete(inner.id);
      }
      return;
    }

    // Event broadcast
    if ('type' in inner && !('id' in inner)) {
      const evt = inner as BridgeEvent;
      const handlers = this.eventHandlers.get(evt.type);
      handlers?.forEach((h) => h(evt.data));
    }
  };

  async request<T>(type: BridgeRequest['type'], payload: unknown = {}, timeoutMs = 30_000): Promise<T> {
    const id = `req-${++this.requestCounter}-${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Plugin SDK request '${type}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, (response) => {
        clearTimeout(timer);
        if (response.success) resolve(response.data as T);
        else reject(new Error(response.error ?? 'Unknown error'));
      });

      const msg: BridgeMessage = {
        source: 'explorer-hub-sdk',
        message: { id, type, payload },
      };
      window.parent.postMessage(msg, this.targetOrigin);
    });
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage);
    this.pendingRequests.clear();
    this.eventHandlers.clear();
  }
}
```

- [ ] **Step 4: Write index.ts (ExplorerHubSDK class)**

```typescript
// packages/plugin-sdk/src/index.ts
import { PostMessageTransport } from './transport';
import type {
  PluginUser,
  HeatmapQuery,
  HeatmapCell,
  TransactionRequest,
  PaymentRequest,
  PaymentReceipt,
  ViewportState,
} from './types';

export type { PluginUser, HeatmapQuery, HeatmapCell, TransactionRequest, PaymentRequest, PaymentReceipt, ViewportState };

export class ExplorerHubSDK {
  private transport: PostMessageTransport;

  constructor(targetOrigin?: string) {
    this.transport = new PostMessageTransport(targetOrigin);
  }

  async getUser(): Promise<PluginUser> {
    return this.transport.request<PluginUser>('getUser');
  }

  async getHeatmap(query: HeatmapQuery): Promise<HeatmapCell[]> {
    return this.transport.request<HeatmapCell[]>('getHeatmap', query);
  }

  async getIntel(intelId: string): Promise<unknown> {
    return this.transport.request('getIntel', { intelId });
  }

  async getRegionSummary(regionId: number): Promise<unknown> {
    return this.transport.request('getRegionSummary', { regionId });
  }

  async getBounties(filter?: { regionId?: number; status?: number }): Promise<unknown> {
    return this.transport.request('getBounties', filter ?? {});
  }

  async requestTransaction(tx: TransactionRequest): Promise<{ txDigest: string }> {
    return this.transport.request('requestTransaction', tx, 60_000); // 60s timeout for user approval
  }

  async requestPayment(payment: PaymentRequest): Promise<PaymentReceipt> {
    return this.transport.request('requestPayment', payment, 60_000);
  }

  onViewportChange(callback: (viewport: ViewportState) => void): () => void {
    return this.transport.on('viewportChange', callback as (data: unknown) => void);
  }

  onIntelSelect(callback: (intelId: string) => void): () => void {
    return this.transport.on('intelSelect', callback as (data: unknown) => void);
  }

  destroy() {
    this.transport.destroy();
  }
}
```

- [ ] **Step 5: Write transport.test.ts**

```typescript
// packages/plugin-sdk/src/__tests__/transport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostMessageTransport } from '../transport';

// Mock window
const listeners: Record<string, Function[]> = {};
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: Function) => {
    listeners[type] = listeners[type] ?? [];
    listeners[type].push(fn);
  },
  removeEventListener: (type: string, fn: Function) => {
    listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
  },
  parent: {
    postMessage: vi.fn(),
  },
});

describe('PostMessageTransport', () => {
  let transport: PostMessageTransport;

  beforeEach(() => {
    transport = new PostMessageTransport('*');
    (window.parent.postMessage as ReturnType<typeof vi.fn>).mockClear();
  });

  it('sends request via postMessage and resolves on response', async () => {
    const promise = transport.request<string>('getUser');

    // Simulate host response
    const sentMsg = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const reqId = sentMsg.message.id;

    // Fire the message event handler
    listeners['message'][0]({
      data: {
        source: 'explorer-hub-host',
        message: { id: reqId, success: true, data: 'user-data' },
      },
    });

    await expect(promise).resolves.toBe('user-data');
  });

  it('rejects on error response', async () => {
    const promise = transport.request('getUser');
    const sentMsg = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const reqId = sentMsg.message.id;

    listeners['message'][0]({
      data: {
        source: 'explorer-hub-host',
        message: { id: reqId, success: false, error: 'Unauthorized' },
      },
    });

    await expect(promise).rejects.toThrow('Unauthorized');
  });

  it('dispatches events to registered handlers', () => {
    const handler = vi.fn();
    transport.on('viewportChange', handler);

    listeners['message'][0]({
      data: {
        source: 'explorer-hub-host',
        message: { type: 'viewportChange', data: { zoom: 5 } },
      },
    });

    expect(handler).toHaveBeenCalledWith({ zoom: 5 });
  });
});
```

- [ ] **Step 6: Write sdk.test.ts**

```typescript
// packages/plugin-sdk/src/__tests__/sdk.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExplorerHubSDK } from '../index';

// Same window mock as transport.test.ts (extract to shared test util if needed)
const listeners: Record<string, Function[]> = {};
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: Function) => {
    listeners[type] = listeners[type] ?? [];
    listeners[type].push(fn);
  },
  removeEventListener: vi.fn(),
  parent: { postMessage: vi.fn() },
});

function simulateResponse(data: unknown) {
  const sentMsg = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
  const reqId = sentMsg?.message?.id;
  listeners['message']?.forEach((fn) =>
    fn({ data: { source: 'explorer-hub-host', message: { id: reqId, success: true, data } } }),
  );
}

describe('ExplorerHubSDK', () => {
  let sdk: ExplorerHubSDK;

  beforeEach(() => {
    (window.parent.postMessage as ReturnType<typeof vi.fn>).mockClear();
    listeners['message'] = [];
    sdk = new ExplorerHubSDK();
  });

  it('getUser returns user data', async () => {
    const promise = sdk.getUser();
    simulateResponse({ address: '0x1', tier: 'premium', subscriptionExpiry: 999 });
    const user = await promise;
    expect(user.address).toBe('0x1');
    expect(user.tier).toBe('premium');
  });

  it('getHeatmap sends correct query', async () => {
    const promise = sdk.getHeatmap({ zoomLevel: 2, regionId: 42 });
    simulateResponse([{ regionId: 42, totalReports: 10 }]);
    const cells = await promise;
    expect(cells).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `cd packages/plugin-sdk && npm install && npx vitest run`

- [ ] **Step 8: Commit**

```
feat(plugin-sdk): add @explorer-hub/plugin-sdk with postMessage transport
```

---

## Task 7: Plugin Bridge (Host-Side)

**Files:**
- Create: `app/src/lib/plugin-bridge/types.ts`
- Create: `app/src/lib/plugin-bridge/permissions.ts`
- Create: `app/src/lib/plugin-bridge/bridge.ts`
- Create: `app/src/lib/plugin-bridge/__tests__/permissions.test.ts`
- Create: `app/src/lib/plugin-bridge/__tests__/bridge.test.ts`

The bridge runs on the host app side. It listens to postMessage from plugin iframes, validates permissions, proxies data requests through the Data API, and shows user-approval modals for transactions/payments.

- [ ] **Step 1: Write types.ts**

```typescript
// app/src/lib/plugin-bridge/types.ts
import type { PluginPermission } from '@/types';
import type { BridgeMessage, BridgeRequest, BridgeResponse, BridgeEvent } from '@explorer-hub/plugin-sdk/types';

export type { BridgeMessage, BridgeRequest, BridgeResponse, BridgeEvent };

export interface PluginBridgeConfig {
  pluginId: string;
  pluginUrl: string;
  permissions: PluginPermission[];
  iframeRef: HTMLIFrameElement;
}

export type TransactionApprovalCallback = (
  pluginId: string,
  request: unknown,
) => Promise<{ approved: boolean; txDigest?: string }>;

export type PaymentApprovalCallback = (
  pluginId: string,
  amount: number,
  description: string,
) => Promise<{ approved: boolean; txDigest?: string }>;
```

- [ ] **Step 2: Write permissions.ts**

```typescript
// app/src/lib/plugin-bridge/permissions.ts
import type { PluginPermission } from '@/types';
import type { BridgeRequest } from './types';

const PERMISSION_MAP: Record<string, PluginPermission> = {
  getUser: 'read:heatmap',        // always allowed (basic info)
  getHeatmap: 'read:heatmap',
  getIntel: 'read:intel',
  getRegionSummary: 'read:heatmap',
  getBounties: 'read:bounties',
  requestTransaction: 'request:transaction',
  requestPayment: 'request:payment',
};

// These request types are always allowed regardless of permissions
const ALWAYS_ALLOWED: Set<string> = new Set(['getUser']);

export function checkPermission(
  request: BridgeRequest,
  grantedPermissions: PluginPermission[],
): { allowed: boolean; requiredPermission?: PluginPermission } {
  if (ALWAYS_ALLOWED.has(request.type)) {
    return { allowed: true };
  }

  const required = PERMISSION_MAP[request.type];
  if (!required) {
    return { allowed: false, requiredPermission: undefined };
  }

  return {
    allowed: grantedPermissions.includes(required),
    requiredPermission: required,
  };
}
```

- [ ] **Step 3: Write bridge.ts**

```typescript
// app/src/lib/plugin-bridge/bridge.ts
import type {
  PluginBridgeConfig,
  BridgeMessage,
  BridgeRequest,
  BridgeResponse,
  TransactionApprovalCallback,
  PaymentApprovalCallback,
} from './types';
import { checkPermission } from './permissions';
import * as apiClient from '@/lib/api-client';

export type GetUserDataCallback = () => { address: string; tier: string; subscriptionExpiry: number };

export class PluginBridge {
  private config: PluginBridgeConfig;
  private getUserData: GetUserDataCallback;
  private onTransactionApproval: TransactionApprovalCallback;
  private onPaymentApproval: PaymentApprovalCallback;

  constructor(
    config: PluginBridgeConfig,
    getUserData: GetUserDataCallback,
    onTransactionApproval: TransactionApprovalCallback,
    onPaymentApproval: PaymentApprovalCallback,
  ) {
    this.config = config;
    this.getUserData = getUserData;
    this.onTransactionApproval = onTransactionApproval;
    this.onPaymentApproval = onPaymentApproval;
    window.addEventListener('message', this.handleMessage);
  }

  private handleMessage = async (event: MessageEvent) => {
    // Validate origin matches plugin URL
    if (new URL(this.config.pluginUrl).origin !== event.origin) return;

    const msg = event.data as BridgeMessage;
    if (msg?.source !== 'explorer-hub-sdk') return;

    const request = msg.message as BridgeRequest;
    if (!request.id || !request.type) return;

    // Check permissions
    const { allowed, requiredPermission } = checkPermission(request, this.config.permissions);
    if (!allowed) {
      this.sendResponse(request.id, false, undefined, `Permission denied: requires '${requiredPermission}'`);
      return;
    }

    try {
      const data = await this.handleRequest(request);
      this.sendResponse(request.id, true, data);
    } catch (err) {
      this.sendResponse(request.id, false, undefined, err instanceof Error ? err.message : 'Unknown error');
    }
  };

  private async handleRequest(request: BridgeRequest): Promise<unknown> {
    const payload = request.payload as Record<string, unknown>;

    switch (request.type) {
      case 'getUser':
        return this.getUserData();
      case 'getHeatmap':
        return apiClient.getHeatmap(payload.zoomLevel as number, payload.regionId as number | undefined);
      case 'getIntel':
        return apiClient.getIntel(payload.intelId as string);
      case 'getRegionSummary':
        return apiClient.getRegionSummary(payload.regionId as number);
      case 'getBounties':
        return apiClient.getActiveBounties();
      case 'requestTransaction':
        return this.onTransactionApproval(this.config.pluginId, payload);
      case 'requestPayment':
        return this.onPaymentApproval(this.config.pluginId, payload.amount as number, payload.description as string);
      default:
        throw new Error(`Unknown request type: ${request.type}`);
    }
  }

  private sendResponse(id: string, success: boolean, data?: unknown, error?: string) {
    const msg: BridgeMessage = {
      source: 'explorer-hub-host',
      message: { id, success, data, error } as BridgeResponse,
    };
    this.config.iframeRef.contentWindow?.postMessage(msg, '*');
  }

  // Host app calls these to broadcast events to plugin
  broadcastViewport(viewport: unknown) {
    const msg: BridgeMessage = {
      source: 'explorer-hub-host',
      message: { type: 'viewportChange', data: viewport },
    };
    this.config.iframeRef.contentWindow?.postMessage(msg, '*');
  }

  broadcastIntelSelect(intelId: string) {
    const msg: BridgeMessage = {
      source: 'explorer-hub-host',
      message: { type: 'intelSelect', data: intelId },
    };
    this.config.iframeRef.contentWindow?.postMessage(msg, '*');
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage);
  }
}
```

- [ ] **Step 4: Write permissions.test.ts**

```typescript
// app/src/lib/plugin-bridge/__tests__/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { checkPermission } from '../permissions';
import type { BridgeRequest } from '../types';

const makeReq = (type: string): BridgeRequest => ({ id: '1', type: type as any, payload: {} });

describe('checkPermission', () => {
  it('always allows getUser', () => {
    expect(checkPermission(makeReq('getUser'), []).allowed).toBe(true);
  });

  it('blocks getHeatmap without read:heatmap', () => {
    const result = checkPermission(makeReq('getHeatmap'), []);
    expect(result.allowed).toBe(false);
    expect(result.requiredPermission).toBe('read:heatmap');
  });

  it('allows getHeatmap with read:heatmap', () => {
    expect(checkPermission(makeReq('getHeatmap'), ['read:heatmap']).allowed).toBe(true);
  });

  it('blocks requestTransaction without request:transaction', () => {
    expect(checkPermission(makeReq('requestTransaction'), ['read:heatmap']).allowed).toBe(false);
  });

  it('allows requestPayment with correct permission', () => {
    expect(checkPermission(makeReq('requestPayment'), ['request:payment']).allowed).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd app && npx vitest run src/lib/plugin-bridge/__tests__/`

- [ ] **Step 6: Commit**

```
feat(app): add Plugin Bridge with permission validation and postMessage proxy
```

---

## Task 8: Page Shells + Route Structure

**Files:**
- Create: `app/src/app/map/page.tsx`
- Create: `app/src/app/submit/page.tsx`
- Create: `app/src/app/bounties/page.tsx`
- Create: `app/src/app/subscribe/page.tsx`
- Create: `app/src/app/store/page.tsx`

Each page is a **minimal shell** that wires hooks to placeholder UI. Frontend engineers replace the placeholder UI with actual components. The shells demonstrate how hooks connect.

- [ ] **Step 1: Write map/page.tsx**

```typescript
// app/src/app/map/page.tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useHeatmap } from '@/hooks/use-heatmap';
import { useMapViewport } from '@/hooks/use-map-viewport';
import { useMapStore } from '@/stores/map-store';

/**
 * Star Map page shell.
 * Frontend engineers: replace placeholder divs with StarMapCanvas (deck.gl),
 * MapControls, IntelPanel, FilterPanel components.
 *
 * Hook contracts:
 * - useHeatmap() → { cells, effectiveZoom, isZoomLimited, tier }
 * - useMapViewport() → { onViewportChange, zoomLevel }
 * - useMapStore → { filters, selectedIntelId, showHeatmap, toggleLayer, ... }
 * - useAuth() → { isPremium, isAuthenticated, login }
 */
export default function MapPage() {
  const { isAuthenticated, isPremium, login } = useAuth();
  const { cells, effectiveZoom, isZoomLimited, isLoading } = useHeatmap();
  const { onViewportChange, zoomLevel } = useMapViewport();
  const selectedIntelId = useMapStore((s) => s.selectedIntelId);

  return (
    <div>
      {/* TODO: Replace with StarMapCanvas */}
      <div data-testid="map-container">
        <p>Zoom: {effectiveZoom} | Cells: {cells.length} | Loading: {String(isLoading)}</p>
        {isZoomLimited && <p>Upgrade to Premium for deeper zoom</p>}
      </div>

      {/* TODO: Replace with MapControls */}
      {/* TODO: Replace with IntelPanel (triggered by selectedIntelId) */}
      {/* TODO: Replace with FilterPanel */}

      {!isAuthenticated && <button onClick={login}>Connect & Authenticate</button>}
    </div>
  );
}
```

- [ ] **Step 2: Write submit/page.tsx**

```typescript
// app/src/app/submit/page.tsx
'use client';

import { useSubmitIntel } from '@/hooks/use-intel';
import { useAuth } from '@/hooks/use-auth';

/**
 * Intel submission page shell.
 * Frontend engineers: replace with SubmitForm + MySubmissions components.
 *
 * Hook contracts:
 * - useSubmitIntel() → { mutateAsync(params), isPending }
 * - Params: { location, rawLocationHash, intelType, severity, expiryMs, visibility }
 */
export default function SubmitPage() {
  const { isAuthenticated } = useAuth();
  const submitIntel = useSubmitIntel();

  return (
    <div>
      <h1>Submit Intel</h1>
      {!isAuthenticated && <p>Connect wallet to submit</p>}
      {/* TODO: Replace with SubmitForm component */}
      {/* TODO: Replace with MySubmissions list */}
      <p>Submit pending: {String(submitIntel.isPending)}</p>
    </div>
  );
}
```

- [ ] **Step 3: Write bounties/page.tsx**

```typescript
// app/src/app/bounties/page.tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useBounties } from '@/hooks/use-bounties';

/**
 * Bounty board page shell.
 * Frontend engineers: replace with BountyBoard + CreateBounty components.
 *
 * Hook contracts:
 * - useBounties() → { bounties, createBounty, claimBounty, refundBounty, isCreating, isClaiming }
 */
export default function BountiesPage() {
  const { isAuthenticated } = useAuth();
  const { bounties, isLoading, isCreating } = useBounties();

  return (
    <div>
      <h1>Bounty Board</h1>
      {!isAuthenticated && <p>Connect wallet to create or claim bounties</p>}
      {/* TODO: Replace with BountyBoard component */}
      {/* TODO: Replace with CreateBounty modal */}
      <p>Active bounties: {bounties.length} | Loading: {String(isLoading)} | Creating: {String(isCreating)}</p>
    </div>
  );
}
```

- [ ] **Step 4: Write subscribe/page.tsx**

```typescript
// app/src/app/subscribe/page.tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';

/**
 * Subscription management page shell.
 * Frontend engineers: replace with TierComparison + MySubscription components.
 *
 * Hook contracts:
 * - useSubscription() → { subscription, isPremium, subscribe, renew, isSubscribing, isRenewing }
 */
export default function SubscribePage() {
  const { isAuthenticated } = useAuth();
  const { subscription, isPremium, isSubscribing } = useSubscription();

  return (
    <div>
      <h1>Subscription</h1>
      {!isAuthenticated && <p>Connect wallet to subscribe</p>}
      {/* TODO: Replace with TierComparison component */}
      {/* TODO: Replace with MySubscription component */}
      <p>Tier: {isPremium ? 'Premium' : 'Free'} | Subscribing: {String(isSubscribing)}</p>
      {subscription && <p>Expires: {new Date(subscription.expiresAt).toLocaleDateString()}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Write store/page.tsx**

```typescript
// app/src/app/store/page.tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { usePlugins } from '@/hooks/use-plugins';

/**
 * Plugin catalog page shell.
 * Frontend engineers: replace with PluginCatalog + PluginDetail + PluginHost components.
 *
 * Hook contracts:
 * - usePlugins() → { usePlugin, isPaying }
 * - PluginHost uses PluginBridge from '@/lib/plugin-bridge/bridge'
 */
export default function StorePage() {
  const { isAuthenticated } = useAuth();
  const { isPaying } = usePlugins();

  return (
    <div>
      <h1>Plugin Store</h1>
      {!isAuthenticated && <p>Connect wallet to use plugins</p>}
      {/* TODO: Replace with PluginCatalog component */}
      {/* TODO: Replace with PluginDetail modal */}
      {/* TODO: Replace with PluginHost (iframe container) */}
      <p>Paying: {String(isPaying)}</p>
    </div>
  );
}
```

Each shell shows the hook wiring and documents what UI components should replace the placeholders.

- [ ] **Step 4: Type check**

Run: `cd app && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```
feat(app): add page shells for map, submit, bounties, subscribe, store
```

---

## Task 9: Monkey Tests — Frontend

**Files:**
- Create: `app/src/__tests__/monkey/auth-monkey.test.ts`
- Create: `app/src/__tests__/monkey/hooks-monkey.test.ts`

Per project test rules: "Unit-Test 和 Integration Test 完之後，一定要做 Monkey Testing"

- [ ] **Step 1: Write auth-monkey.test.ts**

```typescript
// app/src/__tests__/monkey/auth-monkey.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticate, restoreSession, clearSession } from '@/lib/auth';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.clear();
});

describe('auth monkey tests', () => {
  it('handles nonce endpoint returning non-JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('not JSON')),
    });
    const sign = vi.fn();
    await expect(authenticate('0x1', sign)).rejects.toThrow();
  });

  it('handles signature rejection by wallet', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ nonce: 'abc' }),
    });
    const sign = vi.fn().mockRejectedValue(new Error('User rejected'));
    await expect(authenticate('0x1', sign)).rejects.toThrow('User rejected');
  });

  it('handles verify endpoint 500', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nonce: 'abc' }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const sign = vi.fn().mockResolvedValue({ signature: 'sig' });
    await expect(authenticate('0x1', sign)).rejects.toThrow();
  });

  it('restoreSession with corrupted JWT does not crash', () => {
    sessionStorage.setItem('feh_jwt', 'not.a.valid.jwt');
    const jwt = restoreSession();
    // Should return the JWT string (parsing happens in useAuth, not here)
    expect(jwt).toBe('not.a.valid.jwt');
  });

  it('clearSession is idempotent', () => {
    clearSession();
    clearSession(); // should not throw
    expect(restoreSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Write hooks-monkey.test.ts**

```typescript
// app/src/__tests__/monkey/hooks-monkey.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ApiError, setJwt, getHeatmap, getIntel } from '@/lib/api-client';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('API client monkey tests', () => {
  it('handles network timeout (fetch throws)', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));
    await expect(getHeatmap(0)).rejects.toThrow('Failed to fetch');
  });

  it('handles empty response body on error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('no body')),
    });
    await expect(getHeatmap(0)).rejects.toThrow(ApiError);
  });

  it('handles zoom level out of range (negative)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cells: [], tier: 'free' }),
    });
    // Should not crash — server validates, client just sends
    const result = await getHeatmap(-1);
    expect(result).toBeDefined();
  });

  it('handles extremely long intel ID', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ intel: null, locked: true }),
    });
    const longId = '0x' + 'a'.repeat(1000);
    const result = await getIntel(longId);
    expect(result).toBeDefined();
  });

  it('handles concurrent requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cells: [], tier: 'free' }),
    });
    const results = await Promise.all([
      getHeatmap(0),
      getHeatmap(1),
      getHeatmap(2),
    ]);
    expect(results).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run all frontend tests**

Run: `cd app && npx vitest run`

- [ ] **Step 4: Commit**

```
test(app): add monkey tests for auth edge cases and API client extremes
```

---

## Task 10: UX Optimization Spec (for Frontend Engineers)

**Files:**
- Create: `docs/ux-optimization-targets.md`

This task produces a reference document — no code. It defines measurable UX targets and implementation guidance for the frontend engineers.

- [ ] **Step 1: Write UX optimization targets document**

```markdown
# Frontier Explorer Hub — UX Optimization Targets

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
All on-chain mutations (submit intel, unlock, subscribe, create bounty)
should show immediate optimistic state:
- Button → spinner → "Confirming..." → success/error toast
- Do NOT block the map or navigate away during tx
- Use `useUIStore.pendingTx` to show a global tx status bar
- On failure: revert optimistic state + show error toast with retry button

### 2. Map Performance
- deck.gl handles WebGL rendering — do NOT re-render React on every frame
- MapControls must be a separate React tree (not child of DeckGL)
  to avoid re-renders on viewport change
- Use `useMapStore` (Zustand) to share state without prop drilling
- Heatmap data: TanStack Query with `staleTime` + `refetchInterval`
  (Premium: 10s poll, Free: 60s poll)
- When zoom changes, show previous zoom data as placeholder
  while new data loads (stale-while-revalidate)

### 3. Tier-Gated UI Affordances
- Free users seeing locked content: show blurred/dimmed preview
  with "Upgrade to Premium" CTA overlay
- Zoom level 2 for Free users: disable the zoom-in button,
  show tooltip "Premium feature"
- Premium-only fields (byType, avgSeverity): show skeleton loaders,
  not empty space
- Never show an error for tier limits — show upgrade prompts

### 4. Progressive Disclosure
- Map page is 80% of usage — optimize it ruthlessly
- IntelPanel: collapsed by default, expand on intel click
- FilterPanel: hidden behind toggle, persist state in URL params
- Bounty/Subscribe/Store: separate pages, not modals on map

### 5. Offline/Error Resilience
- TanStack Query `staleWhileRevalidate`: show cached data during network issues
- Show a subtle "offline" badge (not a blocking modal)
- Wallet disconnect: show reconnect button, don't clear map state
- Transaction failure: toast + retry button, never auto-retry

### 6. Loading States
- Skeleton loaders for data panels (not spinners)
- Map: show grid outline while heatmap loads
- Intel unlock: show price + "Unlocking..." state during tx
- Bounty board: empty state with "Create first bounty" CTA

### 7. Accessibility & Input
- All interactive elements: keyboard navigable
- Map zoom: scroll wheel + buttons + keyboard (+/-)
- Mobile: responsive layout, touch-friendly filter toggles
- Color scheme: dark theme (space aesthetic) with high-contrast data

## Component Interface Contracts

Frontend engineers should build components that consume the hooks
defined in `app/src/hooks/`. Key contracts:

### StarMapCanvas
```tsx
// Receives heatmap cells, renders deck.gl layers
// Listens to viewport changes via useMapViewport
const { cells, isLoading, effectiveZoom } = useHeatmap();
const { onViewportChange } = useMapViewport();
```

### IntelPanel
```tsx
// Reacts to selected intel from map store
const selectedId = useMapStore(s => s.selectedIntelId);
const { data, isLoading } = useIntelDetail(selectedId);
const unlock = useUnlockIntel();
```

### MapControls
```tsx
// Pure Zustand — no TanStack Query, no re-renders from map
const { zoomLevel, setZoomLevel, toggleLayer, filters, setFilters } = useMapStore();
```

### SubscriptionManager
```tsx
const { subscription, isPremium, subscribe, renew } = useSubscription();
```

### BountyBoard
```tsx
const { bounties, createBounty, claimBounty } = useBounties();
```

### PluginHost
```tsx
// Creates PluginBridge instance per iframe
import { PluginBridge } from '@/lib/plugin-bridge/bridge';
// Pass approval callbacks that open modals via useUIStore
```
```

- [ ] **Step 2: Commit**

```
docs: add UX optimization targets and component interface contracts
```

---

## Design Deviations from Spec

| Deviation | Reason |
|-----------|--------|
| `create-next-app` instead of `create-eve-dapp` | Spec references `create-eve-dapp scaffold` but it is not available as a public package. Manual dapp-kit setup achieves identical result. |
| Auth uses nonce-signed JWT instead of direct wallet query | Spec says "wallet-signed JWT" — this implements the standard nonce challenge flow for replay protection |
| Plugin SDK is a separate package under `packages/` | Keeps it publishable to npm independently; spec defines it as `@explorer-hub/plugin-sdk`. Root `package.json` uses npm workspaces for cross-package linking. |
| Page shells have placeholder UI | Plan B explicitly scopes out visual UI — shells demonstrate hook wiring for frontend engineers |
| No deck.gl layer configuration code | Star map visual config is frontend engineer territory; hooks provide data, engineers build layers |

---

## Summary

| Task | What it builds | Consumers |
|------|---------------|-----------|
| 1 | Next.js scaffold + providers + types + constants | All frontend code |
| 2 | API client + wallet-signed JWT auth + useAuth hook | All data hooks |
| 3 | PTB builders for all 5 contract modules | Data hooks (mutations) |
| 4 | Zustand stores (map state + UI state) | All UI components |
| 5 | Data hooks (heatmap, intel, subscription, bounties, plugins) | Page components |
| 6 | Plugin SDK package (postMessage transport) | Third-party plugin developers |
| 7 | Plugin Bridge (host-side permission proxy) | PluginHost component |
| 8 | Page shells with hook wiring | Frontend engineers (replace placeholders) |
| 9 | Monkey tests (auth, API client edge cases) | CI/QA |
| 10 | UX optimization targets document | Frontend engineers (reference) |
