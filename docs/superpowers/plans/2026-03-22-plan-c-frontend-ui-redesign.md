# Frontend UI Redesign — EVE Frontier Style

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the visual layer with EVE Frontier aesthetics (Tailwind CSS, sidebar nav, medium HUD animations), integrate all 6 pages with real backend, preserve existing data layer untouched.

**Architecture:** Phase 1 builds foundation (Tailwind config, AppShell, Sidebar, shared UI components, animation system). Phase 2 rewrites 6 pages in parallel — each consuming foundation components and existing hooks. Backend integration is free since hooks already wire `signAndExecuteTransaction` + API client.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS v4 (legacy config mode via `@config`), @mysten/dapp-kit, @mysten/sui, Zustand, TanStack Query, deck.gl, Vitest

**Note:** Tailwind v4 uses CSS-first config by default. This plan uses the v4 legacy compatibility path (`@config` directive + `tailwind.config.ts`) for easier migration from v3 patterns. The `@tailwindcss/postcss` plugin supports this.

**Note:** Existing `vitest.config.ts` already has `@/` path alias and `jsdom` environment configured — no changes needed.

**Spec:** `docs/superpowers/specs/2026-03-22-frontend-ui-redesign.md`

---

## File Structure

### New Files

```
app/src/
├── app/
│   ├── globals.css              — Tailwind directives + base styles (replaces old globals.css)
│   ├── layout.tsx               — Modified: import new CSS, wrap with AppShell
│   ├── page.tsx                 — Rewrite: Dashboard with real data
│   ├── map/page.tsx             — Rewrite: dual-mode map
│   ├── submit/page.tsx          — Rewrite: on-chain submit form
│   ├── bounties/page.tsx        — Rewrite: on-chain bounty board
│   ├── subscribe/page.tsx       — Rewrite: subscription + upgrade
│   └── store/page.tsx           — Rewrite: plugin marketplace
├── components/
│   ├── AppShell.tsx             — Sidebar + topbar + content layout
│   ├── Sidebar.tsx              — Navigation + wallet connect
│   ├── ToastContainer.tsx       — Toast notification renderer
│   └── ui/
│       ├── Panel.tsx            — Reusable panel wrapper
│       ├── MetricChip.tsx       — Stat display chip
│       ├── RiskBadge.tsx        — Risk level badge (CRITICAL/HIGH/MEDIUM/LOW)
│       └── StatusChip.tsx       — Status indicator chip
├── hooks/
│   └── use-dashboard.ts         — Combine heatmap + region summary
└── lib/
    └── mock-data.ts             — Removed after all pages migrated
```

### Modified Files

```
app/tailwind.config.ts           — New: EVE Frontier theme + animation plugin
app/postcss.config.mjs           — New: Tailwind PostCSS plugin (ESM)
app/src/stores/ui-store.ts       — Add: sidebarCollapsed + toggleSidebar
```

### Deleted Files

```
app/src/app/shell-frame.tsx      — Replaced by AppShell
app/src/lib/risk-class.ts        — Inlined into RiskBadge
```

### Preserved Files (no changes)

```
app/src/lib/api-client.ts
app/src/lib/auth.ts
app/src/lib/constants.ts
app/src/lib/ptb/*.ts             — 5 PTB builders
app/src/hooks/use-auth.ts
app/src/hooks/use-heatmap.ts
app/src/hooks/use-intel.ts
app/src/hooks/use-subscription.ts
app/src/hooks/use-bounties.ts
app/src/hooks/use-plugins.ts
app/src/hooks/use-map-viewport.ts
app/src/stores/map-store.ts
app/src/types/index.ts
app/src/lib/plugin-bridge/
packages/plugin-sdk/
```

---

## Task 1: Install Tailwind CSS + Configure Build Pipeline

**Files:**
- Create: `app/tailwind.config.ts`
- Create: `app/postcss.config.mjs`
- Modify: `app/src/app/globals.css` (replace content with Tailwind directives)
- Modify: `app/package.json` (add tailwind deps)

- [ ] **Step 1: Install Tailwind dependencies**

```bash
cd next-monorepo/app && npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

- [ ] **Step 2: Create postcss.config.mjs**

```js
// app/postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 3: Create tailwind.config.ts with EVE Frontier theme**

```typescript
// app/tailwind.config.ts
import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        eve: {
          bg: "#020304",
          panel: "rgba(8, 11, 16, 0.9)",
          "panel-border": "rgba(171, 190, 217, 0.22)",
          text: "#e7edf8",
          muted: "rgba(231, 237, 248, 0.62)",
          cold: "#9db6d8",
          danger: "#db7768",
          warn: "#d3b075",
          safe: "#9fd1b2",
          info: "#bdd4f1",
          gold: "#e4b480",
          glow: "rgba(122, 176, 227, 0.68)",
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "glow-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px rgba(243, 197, 142, 0.35) inset, 0 0 14px rgba(243, 197, 142, 0.16)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1px rgba(243, 197, 142, 0.5) inset, 0 0 24px rgba(243, 197, 142, 0.32)",
          },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.85)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "data-decrypt": {
          "0%": { opacity: "0", filter: "blur(4px)" },
          "50%": { opacity: "0.6", filter: "blur(1px)" },
          "100%": { opacity: "1", filter: "blur(0)" },
        },
      },
      animation: {
        scanline: "scanline 8s linear infinite",
        "glow-pulse": "glow-pulse 2.2s ease-in-out infinite",
        "slide-in": "slide-in 0.3s ease-out both",
        "pulse-dot": "pulse-dot 1.5s ease-in-out infinite",
        flicker: "flicker 3s ease-in-out infinite",
        "data-decrypt": "data-decrypt 0.6s ease-out both",
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".bg-eve-space": {
          background: `radial-gradient(1200px 580px at 92% -10%, rgba(82, 109, 152, 0.18), transparent 70%),
            radial-gradient(900px 460px at 8% 15%, rgba(137, 82, 70, 0.13), transparent 72%),
            linear-gradient(180deg, #020304, #040609 70%)`,
        },
        ".bg-eve-noise": {
          backgroundImage:
            "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 2px, transparent 7px)",
        },
        ".bg-eve-stars": {
          backgroundImage: `radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.4), transparent),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.2), transparent),
            radial-gradient(1px 1px at 70% 80%, rgba(255,255,255,0.35), transparent),
            radial-gradient(1px 1px at 90% 40%, rgba(255,255,255,0.25), transparent),
            radial-gradient(1px 1px at 15% 90%, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 85% 15%, rgba(255,255,255,0.2), transparent)`,
        },
      });
    }),
  ],
};

export default config;
```

- [ ] **Step 4: Replace globals.css with Tailwind directives + base styles**

```css
/* app/src/app/globals.css */
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap");
@import "tailwindcss";
@config "../../tailwind.config.ts";

@layer base {
  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    min-height: 100%;
  }

  body {
    @apply font-mono text-eve-text bg-eve-space;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
}
```

- [ ] **Step 5: Verify Tailwind builds**

```bash
cd next-monorepo/app && npx next build 2>&1 | head -20
```

Expected: Build succeeds (pages will look broken since they still use old CSS classes — that's expected).

- [ ] **Step 6: Commit**

```bash
git add next-monorepo/app/tailwind.config.ts next-monorepo/app/postcss.config.mjs next-monorepo/app/src/app/globals.css next-monorepo/app/package.json next-monorepo/app/package-lock.json
git commit -m "feat: install Tailwind CSS with EVE Frontier theme and animation system"
```

---

## Task 2: Shared UI Components

**Files:**
- Create: `app/src/components/ui/Panel.tsx`
- Create: `app/src/components/ui/MetricChip.tsx`
- Create: `app/src/components/ui/RiskBadge.tsx`
- Create: `app/src/components/ui/StatusChip.tsx`
- Create: `app/src/components/ToastContainer.tsx`
- Test: `app/src/__tests__/components/ui.test.tsx`

- [ ] **Step 1: Write tests for UI components**

```typescript
// app/src/__tests__/components/ui.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "@/components/ui/Panel";
import { MetricChip } from "@/components/ui/MetricChip";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusChip } from "@/components/ui/StatusChip";

describe("Panel", () => {
  it("renders title and children", () => {
    render(<Panel title="Test" badge="3"><p>content</p></Panel>);
    expect(screen.getByText("Test")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("content")).toBeDefined();
  });
});

describe("MetricChip", () => {
  it("renders label and value", () => {
    render(<MetricChip label="Uplink" value="Nominal" />);
    expect(screen.getByText("Uplink")).toBeDefined();
    expect(screen.getByText("Nominal")).toBeDefined();
  });
});

describe("RiskBadge", () => {
  it("renders risk text with correct styling class", () => {
    const { container } = render(<RiskBadge risk="CRITICAL" />);
    expect(screen.getByText("CRITICAL")).toBeDefined();
    expect(container.querySelector(".text-eve-danger")).not.toBeNull();
  });

  it("maps severity number to risk level", () => {
    render(<RiskBadge severity={9} />);
    expect(screen.getByText("CRITICAL")).toBeDefined();
  });
});

describe("StatusChip", () => {
  it("renders label with active state", () => {
    render(<StatusChip label="LIVE" active />);
    expect(screen.getByText("LIVE")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd next-monorepo/app && npx vitest run src/__tests__/components/ui.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement Panel**

```typescript
// app/src/components/ui/Panel.tsx
import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
  animate?: boolean;
}

export function Panel({ title, badge, children, className = "", animate = true }: PanelProps) {
  return (
    <article
      className={`border border-eve-panel-border bg-eve-panel p-3 ${animate ? "animate-slide-in" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm tracking-wide uppercase text-eve-cold">{title}</h2>
        {badge && <span className="text-xs text-eve-muted">{badge}</span>}
      </div>
      {children}
    </article>
  );
}
```

- [ ] **Step 4: Implement MetricChip**

```typescript
// app/src/components/ui/MetricChip.tsx
interface MetricChipProps {
  label: string;
  value: string;
}

export function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="border border-eve-panel-border bg-[rgba(8,11,16,0.68)] px-2 py-1.5">
      <span className="block text-[0.61rem] text-eve-muted">{label}</span>
      <strong className="text-xs tracking-wide">{value}</strong>
    </div>
  );
}
```

- [ ] **Step 5: Implement RiskBadge**

```typescript
// app/src/components/ui/RiskBadge.tsx
type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: "text-eve-danger border-eve-danger/50",
  HIGH: "text-eve-warn border-eve-warn/46",
  MEDIUM: "text-eve-info border-eve-panel-border",
  LOW: "text-eve-safe border-eve-panel-border",
};

function severityToRisk(severity: number): RiskLevel {
  if (severity >= 8) return "CRITICAL";
  if (severity >= 5) return "HIGH";
  if (severity >= 3) return "MEDIUM";
  return "LOW";
}

interface RiskBadgeProps {
  risk?: RiskLevel;
  severity?: number;
}

export function RiskBadge({ risk, severity }: RiskBadgeProps) {
  const level = risk ?? (severity != null ? severityToRisk(severity) : "LOW");
  return (
    <span
      className={`text-[0.6rem] border px-1 py-0.5 whitespace-nowrap ${RISK_COLORS[level]}`}
    >
      {level}
    </span>
  );
}
```

- [ ] **Step 6: Implement StatusChip**

```typescript
// app/src/components/ui/StatusChip.tsx
interface StatusChipProps {
  label: string;
  active?: boolean;
}

export function StatusChip({ label, active = false }: StatusChipProps) {
  return (
    <span
      className={`text-[0.64rem] tracking-widest border px-1.5 py-0.5 ${
        active
          ? "border-eve-danger/60 text-[#f2c4bc] animate-pulse-dot"
          : "border-eve-panel-border text-eve-muted"
      }`}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 7: Implement ToastContainer**

```typescript
// app/src/components/ToastContainer.tsx
"use client";

import { useUIStore } from "@/stores/ui-store";

const TOAST_COLORS = {
  success: "border-eve-safe/50 text-eve-safe",
  error: "border-eve-danger/50 text-eve-danger",
  warning: "border-eve-warn/50 text-eve-warn",
  info: "border-eve-info/50 text-eve-info",
} as const;

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`border bg-eve-panel px-3 py-2 text-xs font-mono animate-slide-in cursor-pointer ${TOAST_COLORS[toast.type]}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Run tests**

```bash
cd next-monorepo/app && npx vitest run src/__tests__/components/ui.test.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add next-monorepo/app/src/components/ next-monorepo/app/src/__tests__/components/
git commit -m "feat: add shared UI components (Panel, MetricChip, RiskBadge, StatusChip, ToastContainer)"
```

---

## Task 3: AppShell + Sidebar

**Files:**
- Create: `app/src/components/Sidebar.tsx`
- Create: `app/src/components/AppShell.tsx`
- Modify: `app/src/stores/ui-store.ts` (add sidebarCollapsed + toggleSidebar)
- Test: `app/src/__tests__/components/sidebar.test.tsx`

- [ ] **Step 1: Add sidebar state to ui-store**

Add to `app/src/stores/ui-store.ts`:

In the `UIState` interface, add:
```typescript
sidebarCollapsed: boolean;
toggleSidebar: () => void;
```

In the `create<UIState>` initializer, add:
```typescript
sidebarCollapsed: false,
toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
```

- [ ] **Step 2: Write Sidebar test**

```typescript
// app/src/__tests__/components/sidebar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/Sidebar";

// Mock dapp-kit hooks
vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => null,
  ConnectButton: () => <button>Connect Wallet</button>,
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Sidebar", () => {
  it("renders all 6 navigation items", () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Tactical Map")).toBeDefined();
    expect(screen.getByText("Submit Intel")).toBeDefined();
    expect(screen.getByText("Bounties")).toBeDefined();
    expect(screen.getByText("Membership")).toBeDefined();
    expect(screen.getByText("Plugin Store")).toBeDefined();
  });

  it("hides labels when collapsed", () => {
    render(<Sidebar collapsed={true} />);
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("shows connect button when no wallet", () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText("Connect Wallet")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd next-monorepo/app && npx vitest run src/__tests__/components/sidebar.test.tsx
```

Expected: FAIL — Sidebar not found.

- [ ] **Step 4: Implement Sidebar**

```typescript
// app/src/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useAuth } from "@/hooks/use-auth";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { path: "/map", label: "Tactical Map", icon: "M12 2v20M2 12h20M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" },
  { path: "/submit", label: "Submit Intel", icon: "M12 19V5M5 12l7-7 7 7" },
  { path: "/bounties", label: "Bounties", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6a6 6 0 100 12 6 6 0 000-12zM12 10a2 2 0 100 4 2 2 0 000-4z" },
  { path: "/subscribe", label: "Membership", icon: "M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" },
  { path: "/store", label: "Plugin Store", icon: "M3 3h5v5H3zM10 3h5v5h-5zM17 3h5v5h-5zM3 10h5v5H3zM10 10h5v5h-5zM17 10h5v5h-5zM3 17h5v5H3zM10 17h5v5h-5zM17 17h5v5h-5z" },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const account = useCurrentAccount();
  const auth = useAuth();

  return (
    <nav
      className={`fixed top-0 left-0 h-screen bg-eve-panel border-r border-eve-panel-border flex flex-col z-40 transition-all duration-200 ${
        collapsed ? "w-14" : "w-[200px]"
      }`}
    >
      {/* Brand */}
      <div className="px-3 py-4 border-b border-eve-panel-border">
        {!collapsed && (
          <span className="text-[0.66rem] tracking-widest uppercase text-eve-cold border border-eve-panel-border px-1.5 py-0.5">
            FEH
          </span>
        )}
        {collapsed && (
          <span className="text-xs text-eve-cold font-bold block text-center">F</span>
        )}
      </div>

      {/* Nav Items */}
      <div className="flex-1 py-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-xs tracking-wide transition-colors ${
                active
                  ? "text-eve-text bg-[rgba(16,22,31,0.9)] border-r-2 border-eve-danger/50"
                  : "text-eve-muted hover:text-eve-text hover:bg-[rgba(16,22,31,0.5)]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                className={`w-4 h-4 shrink-0 ${active ? "animate-pulse-dot" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d={item.icon} />
              </svg>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Wallet Section */}
      <div className="border-t border-eve-panel-border p-3">
        {account ? (
          <div className={collapsed ? "text-center" : ""}>
            <p className="text-[0.6rem] text-eve-muted truncate">
              {collapsed
                ? account.address.slice(0, 4)
                : `${account.address.slice(0, 6)}...${account.address.slice(-4)}`}
            </p>
            {!collapsed && (
              <span
                className={`text-[0.58rem] border px-1 py-0.5 mt-1 inline-block ${
                  auth.isPremium
                    ? "border-eve-gold/60 text-eve-gold"
                    : "border-eve-panel-border text-eve-muted"
                }`}
              >
                {auth.isPremium ? "PREMIUM" : "FREE"}
              </span>
            )}
          </div>
        ) : (
          <ConnectButton />
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="border-t border-eve-panel-border p-2 text-eve-muted hover:text-eve-text text-xs text-center"
      >
        {collapsed ? ">" : "<"}
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Implement AppShell**

```typescript
// app/src/components/AppShell.tsx
"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "./ToastContainer";
import { useUIStore } from "@/stores/ui-store";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Scanline overlay */}
      <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.04]">
        <div className="w-full h-px bg-eve-cold/40 animate-scanline" />
      </div>

      {/* Noise overlay */}
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-[0.18] bg-eve-noise" />

      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <main
        className={`min-h-screen transition-all duration-200 ${
          collapsed ? "ml-14" : "ml-[200px]"
        }`}
      >
        <div className="max-w-[1300px] mx-auto p-4">
          {children}
        </div>
      </main>

      <ToastContainer />
    </>
  );
}
```

- [ ] **Step 6: Run tests**

```bash
cd next-monorepo/app && npx vitest run src/__tests__/components/sidebar.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add next-monorepo/app/src/components/AppShell.tsx next-monorepo/app/src/components/Sidebar.tsx next-monorepo/app/src/stores/ui-store.ts next-monorepo/app/src/__tests__/components/sidebar.test.tsx
git commit -m "feat: add AppShell with collapsible sidebar and wallet integration"
```

---

## Task 4: Wire AppShell into Layout + PageHeader Component

**Files:**
- Modify: `app/src/app/layout.tsx`
- Create: `app/src/components/PageHeader.tsx`
- Delete: `app/src/app/shell-frame.tsx`
- Delete: `app/src/lib/risk-class.ts`

- [ ] **Step 1: Create PageHeader component**

This replaces ShellFrame's header section. Each page provides title/subtitle/metrics.

```typescript
// app/src/components/PageHeader.tsx
import { StatusChip } from "./ui/StatusChip";
import { MetricChip } from "./ui/MetricChip";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  metrics?: { label: string; value: string }[];
  variant?: "default" | "store" | "membership";
}

export function PageHeader({ title, subtitle, metrics, variant = "default" }: PageHeaderProps) {
  const accentClass =
    variant === "store" ? "text-eve-info" : variant === "membership" ? "text-eve-gold" : "text-eve-cold";

  return (
    <>
      {/* Topbar */}
      <div className="border border-eve-panel-border bg-[rgba(7,9,13,0.93)] flex items-center gap-2.5 px-2.5 py-1.5">
        <StatusChip label="LIVE" active />
        <span className="text-[0.7rem] text-eve-muted">
          EVE Frontier open-source frontier intelligence monitor
        </span>
      </div>

      {/* Header */}
      <div className="mt-2.5 border border-eve-panel-border bg-gradient-to-b from-[rgba(10,13,18,0.96)] to-[rgba(7,10,15,0.96)] p-3 flex justify-between gap-4">
        <div>
          <span className={`border border-eve-panel-border text-[0.66rem] px-1.5 py-0.5 tracking-widest uppercase ${accentClass}`}>
            Frontier Explorer Hub
          </span>
          <h1 className="mt-1.5 text-[clamp(1.1rem,2.3vw,1.9rem)] tracking-wide font-bold">
            {title}
          </h1>
          <p className="mt-1.5 text-[0.72rem] text-eve-muted">{subtitle}</p>
        </div>
        {metrics && metrics.length > 0 && (
          <div className="grid grid-cols-3 gap-2 self-center" style={{ minWidth: 330 }}>
            {metrics.map((m) => (
              <MetricChip key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update layout.tsx**

```typescript
// app/src/app/layout.tsx
import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify dev server starts**

```bash
cd next-monorepo/app && npx next dev &
sleep 5 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

Expected: 200 (page loads — content may be unstyled since pages still reference ShellFrame, which is OK — they'll be rewritten next).

- [ ] **Step 4: Commit**

```bash
git add next-monorepo/app/src/app/layout.tsx next-monorepo/app/src/components/PageHeader.tsx
git rm next-monorepo/app/src/app/shell-frame.tsx next-monorepo/app/src/lib/risk-class.ts
git commit -m "feat: wire AppShell into layout, add PageHeader, remove ShellFrame"
```

---

## Task 5: useDashboard Hook

**Files:**
- Create: `app/src/hooks/use-dashboard.ts`
- Test: `app/src/__tests__/hooks/use-dashboard.test.ts`

- [ ] **Step 1: Write test**

```typescript
// app/src/__tests__/hooks/use-dashboard.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock api-client
vi.mock("@/lib/api-client", () => ({
  getHeatmap: vi.fn().mockResolvedValue({
    cells: [
      { cell: { regionId: 1, sectorX: 10, sectorY: 20, sectorZ: 0, zoomLevel: 0 }, totalReports: 5, reporterCount: 3, suppressed: false, avgSeverity: 7, latestTimestamp: Date.now() },
      { cell: { regionId: 2, sectorX: 30, sectorY: 40, sectorZ: 0, zoomLevel: 0 }, totalReports: 2, reporterCount: 1, suppressed: false, avgSeverity: 3, latestTimestamp: Date.now() },
    ],
    tier: "free",
  }),
  getRegionSummary: vi.fn().mockResolvedValue({
    regionId: 0,
    totalReports: 7,
    byType: { 0: 3, 1: 4 },
    activeBounties: 2,
  }),
}));

import { cellsToFeedItems } from "@/hooks/use-dashboard";

describe("cellsToFeedItems", () => {
  it("converts aggregated cells to feed items sorted by timestamp desc", () => {
    const cells = [
      { cell: { regionId: 1, sectorX: 10, sectorY: 20, sectorZ: 0, zoomLevel: 0 }, totalReports: 5, reporterCount: 3, suppressed: false, avgSeverity: 7, latestTimestamp: 1000 },
      { cell: { regionId: 2, sectorX: 30, sectorY: 40, sectorZ: 0, zoomLevel: 0 }, totalReports: 2, reporterCount: 1, suppressed: false, avgSeverity: 3, latestTimestamp: 2000 },
    ];
    const items = cellsToFeedItems(cells);
    expect(items).toHaveLength(2);
    expect(items[0].system).toBe(2); // higher timestamp first
    expect(items[0].risk).toBe("MEDIUM");
    expect(items[1].risk).toBe("HIGH");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-dashboard.test.ts
```

Expected: FAIL — cellsToFeedItems not found.

- [ ] **Step 3: Implement useDashboard**

```typescript
// app/src/hooks/use-dashboard.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { getHeatmap, getRegionSummary } from "@/lib/api-client";
import { useAuth } from "./use-auth";
import type { AggregatedCell } from "@/types";
import { useState } from "react";

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface FeedItem {
  id: string;
  system: number;
  note: string;
  risk: RiskLevel;
  ts: string;
}

function severityToRisk(severity: number): RiskLevel {
  if (severity >= 8) return "CRITICAL";
  if (severity >= 5) return "HIGH";
  if (severity >= 3) return "MEDIUM";
  return "LOW";
}

export function cellsToFeedItems(cells: AggregatedCell[]): FeedItem[] {
  return [...cells]
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    .slice(0, 10)
    .map((cell, i) => ({
      id: `INT-${cell.cell.regionId}-${i}`,
      system: cell.cell.regionId,
      note: `${cell.totalReports} reports from ${cell.reporterCount} sources in sector ${cell.cell.sectorX},${cell.cell.sectorY}`,
      risk: severityToRisk(cell.avgSeverity ?? 0),
      ts: new Date(cell.latestTimestamp).toISOString().slice(11, 16),
    }));
}

export function useDashboard() {
  const { isAuthenticated } = useAuth();
  const [regionId, setRegionId] = useState(0);

  const heatmap = useQuery({
    queryKey: ["heatmap", 0, isAuthenticated],
    queryFn: () => getHeatmap(0),
    staleTime: 30_000,
  });

  const regionSummary = useQuery({
    queryKey: ["regionSummary", regionId],
    queryFn: () => getRegionSummary(regionId),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const cells = heatmap.data?.cells ?? [];
  const feedItems = cellsToFeedItems(cells);

  const stats = {
    totalReports: cells.reduce((sum, c) => sum + c.totalReports, 0),
    alertCount: cells.filter((c) => (c.avgSeverity ?? 0) >= 5).length,
    activeRegions: new Set(cells.map((c) => c.cell.regionId)).size,
  };

  return {
    feedItems,
    stats,
    regionSummary: regionSummary.data,
    regionId,
    setRegionId,
    isLoading: heatmap.isLoading,
    isError: heatmap.isError,
  };
}
```

- [ ] **Step 4: Run test**

```bash
cd next-monorepo/app && npx vitest run src/__tests__/hooks/use-dashboard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next-monorepo/app/src/hooks/use-dashboard.ts next-monorepo/app/src/__tests__/hooks/use-dashboard.test.ts
git commit -m "feat: add useDashboard hook combining heatmap + region summary"
```

---

## Task 6: Dashboard Page Rewrite (`/`)

**Files:**
- Rewrite: `app/src/app/page.tsx`

- [ ] **Step 1: Rewrite Dashboard page**

```typescript
// app/src/app/page.tsx
"use client";

import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useDashboard } from "@/hooks/use-dashboard";
import { headlines, timelineEvents } from "@/lib/mock-data";

export default function HomePage() {
  const { feedItems, stats, regionSummary, isLoading } = useDashboard();
  const breaking = headlines[0];

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

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        {/* Main Column */}
        <div className="grid gap-3">
          {/* Breaking */}
          <Panel title="Breaking" badge={breaking.risk}>
            <h2 className="mt-2 text-base leading-snug">{breaking.title}</h2>
            <p className="mt-2 text-[0.74rem] text-eve-muted/80 leading-relaxed">{breaking.summary}</p>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">{breaking.id}</span>
              <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">{breaking.category}</span>
              <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">{breaking.ts}</span>
            </div>
          </Panel>

          {/* Headlines + Briefing */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 max-lg:grid-cols-1">
            <Panel title="Daily Briefing" badge="AI Summary">
              <p className="mt-2 text-[0.73rem] text-eve-muted/80 leading-relaxed">
                Frontier pressure is concentrated on jump lanes and refinery belts. Recommended playbook: escort convoy traffic, prioritize relay diagnostics, and keep rapid-response bounty teams near reactor-live wreck zones.
              </p>
            </Panel>

            <Panel title="Headlines" badge={`${headlines.length} entries`}>
              <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
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
                <strong className="block text-sm">{regionSummary?.activeBounties ?? 0}</strong>
                <p className="text-[0.64rem] text-eve-muted">Bounties</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify page renders**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/page.tsx
git commit -m "feat: rewrite Dashboard page with Tailwind + real data feed"
```

---

## Task 7: Map Page Rewrite (`/map`) — Dual Mode

**Files:**
- Rewrite: `app/src/app/map/page.tsx`

- [ ] **Step 1: Rewrite Map page with dual-mode tabs**

```typescript
// app/src/app/map/page.tsx
"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useHeatmap } from "@/hooks/use-heatmap";
import { useMapStore } from "@/stores/map-store";
import { useDashboard } from "@/hooks/use-dashboard";

type MapTab = "ef-map" | "heatmap";

export default function MapPage() {
  const { cells, effectiveZoom, isZoomLimited, isLoading } = useHeatmap();
  const { feedItems } = useDashboard();
  const setZoomLevel = useMapStore((s) => s.setZoomLevel);
  const zoomLevel = useMapStore((s) => s.zoomLevel);
  const [tab, setTab] = useState<MapTab>("ef-map");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="TACTICAL CONFLICT MAP"
        subtitle="Map control surface with tier-aware zoom behavior and live intel stream."
        metrics={[
          { label: "Zoom Level", value: String(effectiveZoom) },
          { label: "Visible Cells", value: String(cells.length) },
          { label: "Loading", value: isLoading ? "Yes" : "No" },
        ]}
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        {/* Main Column */}
        <div className="grid gap-3">
          {/* Map Controls */}
          <Panel title="Map Controls" badge={`Zoom ${effectiveZoom}`}>
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                className={`border px-3 py-2 text-xs uppercase tracking-wide cursor-pointer ${
                  tab === "ef-map"
                    ? "border-eve-gold/60 text-eve-gold bg-[rgba(28,21,16,0.6)]"
                    : "border-eve-panel-border text-eve-muted bg-[rgba(12,16,24,0.95)] hover:text-eve-text"
                }`}
                onClick={() => setTab("ef-map")}
              >
                Conflict Map
              </button>
              <button
                className={`border px-3 py-2 text-xs uppercase tracking-wide cursor-pointer ${
                  tab === "heatmap"
                    ? "border-eve-gold/60 text-eve-gold bg-[rgba(28,21,16,0.6)]"
                    : "border-eve-panel-border text-eve-muted bg-[rgba(12,16,24,0.95)] hover:text-eve-text"
                }`}
                onClick={() => setTab("heatmap")}
              >
                Intel Heatmap
              </button>
              <span className="border-l border-eve-panel-border mx-1" />
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-muted hover:text-eve-text px-3 py-2 text-xs uppercase tracking-wide cursor-pointer"
                onClick={() => setZoomLevel(zoomLevel - 1)}
              >
                Zoom Out
              </button>
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-muted hover:text-eve-text px-3 py-2 text-xs uppercase tracking-wide cursor-pointer"
                onClick={() => setZoomLevel(zoomLevel + 1)}
              >
                Zoom In
              </button>
            </div>
            {isZoomLimited && (
              <p className="mt-2 text-[0.73rem] text-eve-warn animate-flicker">
                Current tier limits deeper zoom. Upgrade to Premium for full depth.
              </p>
            )}
          </Panel>

          {/* Map View */}
          <Panel title={tab === "ef-map" ? "Conflict Map" : "Intel Heatmap"} badge={tab === "ef-map" ? "External Embed" : `${cells.length} cells`}>
            {tab === "ef-map" ? (
              <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1">
                <iframe
                  className="w-full min-h-[400px] border-0 block"
                  src="https://ef-map.com/embed?embed=1"
                  title="EVE Frontier map"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
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
            )}
          </Panel>
        </div>

        {/* Sidebar Column */}
        <div className="grid gap-3 content-start">
          <Panel title="Selected Intel" badge={selected ?? "none"}>
            <p className="mt-2 text-[0.73rem] text-eve-muted/80">
              {selected ? `Viewing cell ${selected}` : "Click a cell or feed item to inspect."}
            </p>
          </Panel>

          <Panel title="Live Feed" badge={String(feedItems.length)}>
            <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
              {feedItems.map((item) => (
                <button
                  key={item.id}
                  className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2 text-left w-full cursor-pointer hover:border-eve-glow/40 transition-colors"
                  onClick={() => setSelected(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{item.id}</strong>
                    <RiskBadge risk={item.risk} />
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">{item.note}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">SYS-{item.system}</span>
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.ts} UTC</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/map/page.tsx
git commit -m "feat: rewrite Map page with dual-mode toggle (ef-map + heatmap)"
```

---

## Task 8: Submit Page Rewrite (`/submit`)

**Files:**
- Rewrite: `app/src/app/submit/page.tsx`

- [ ] **Step 1: Rewrite Submit page with on-chain integration**

```typescript
// app/src/app/submit/page.tsx
"use client";

import { useState, useMemo } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { useSubmitIntel } from "@/hooks/use-intel";
import { useUIStore } from "@/stores/ui-store";
import { INTEL_TYPE_LABELS, MIN_SUBMIT_DEPOSIT_MIST } from "@/lib/constants";

const EXPIRY_OPTIONS = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "6 hours", ms: 21_600_000 },
  { label: "24 hours", ms: 86_400_000 },
  { label: "7 days", ms: 604_800_000 },
];

export default function SubmitPage() {
  const account = useCurrentAccount();
  const submitIntel = useSubmitIntel();
  const pendingTx = useUIStore((s) => s.pendingTx);

  const [regionId, setRegionId] = useState(0);
  const [sectorX, setSectorX] = useState(0);
  const [sectorY, setSectorY] = useState(0);
  const [sectorZ, setSectorZ] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [intelType, setIntelType] = useState(0);
  const [severity, setSeverity] = useState(5);
  const [expiryMs, setExpiryMs] = useState(EXPIRY_OPTIONS[2].ms);
  const [visibility, setVisibility] = useState(0);
  const [depositMist, setDepositMist] = useState(MIN_SUBMIT_DEPOSIT_MIST);
  const [txHistory, setTxHistory] = useState<{ digest: string; ts: number }[]>([]);

  const rawLocationHash = useMemo(() => {
    const data = `${regionId}:${sectorX}:${sectorY}:${sectorZ}:${zoomLevel}`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    // Simple hash for demo — in production use crypto.subtle.digest
    const hash: number[] = [];
    for (let i = 0; i < 32; i++) {
      hash.push(bytes[i % bytes.length] ^ (i * 31));
    }
    return hash;
  }, [regionId, sectorX, sectorY, sectorZ, zoomLevel]);

  const onSubmit = async () => {
    if (!account) return;
    try {
      const result = await submitIntel.mutateAsync({
        location: { regionId, sectorX, sectorY, sectorZ, zoomLevel },
        rawLocationHash,
        intelType,
        severity,
        expiryMs: Date.now() + expiryMs,
        visibility,
        depositMist,
      });
      setTxHistory((prev) => [{ digest: result.digest, ts: Date.now() }, ...prev]);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <>
      <PageHeader
        title="INTEL SUBMISSION DESK"
        subtitle="Submit on-chain intel reports with deposit stake and expiry configuration."
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          <Panel title="New Report" badge={account ? "Ready" : "Connect Wallet"}>
            {/* Location */}
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[
                { label: "Region ID", value: regionId, set: setRegionId },
                { label: "Sector X", value: sectorX, set: setSectorX },
                { label: "Sector Y", value: sectorY, set: setSectorY },
                { label: "Sector Z", value: sectorZ, set: setSectorZ },
                { label: "Zoom", value: zoomLevel, set: setZoomLevel },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <p className="text-[0.66rem] text-eve-muted mb-1">{label}</p>
                  <input
                    className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                    type="number"
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                </div>
              ))}
            </div>

            {/* Intel Type + Severity */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Intel Type</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={intelType}
                  onChange={(e) => setIntelType(Number(e.target.value))}
                >
                  {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Severity (0-10)</p>
                <input
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  type="range"
                  min={0}
                  max={10}
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                />
                <span className="text-xs text-eve-muted">{severity}</span>
              </div>
            </div>

            {/* Expiry + Visibility + Deposit */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Expiry</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={expiryMs}
                  onChange={(e) => setExpiryMs(Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.ms} value={opt.ms}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Visibility</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={visibility}
                  onChange={(e) => setVisibility(Number(e.target.value))}
                >
                  <option value={0}>Public</option>
                  <option value={1}>Subscribers Only</option>
                </select>
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Deposit (MIST)</p>
                <input
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  type="number"
                  min={MIN_SUBMIT_DEPOSIT_MIST}
                  value={depositMist}
                  onChange={(e) => setDepositMist(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-4 py-2.5 uppercase tracking-wide cursor-pointer hover:border-eve-cold/50 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onSubmit}
                disabled={!account || submitIntel.isPending}
              >
                {submitIntel.isPending ? "Submitting..." : "Submit Intel"}
              </button>
            </div>
            {pendingTx && (
              <p className="mt-2 text-xs text-eve-cold animate-pulse-dot">
                Pending: {pendingTx.slice(0, 16)}...
              </p>
            )}
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          <Panel title="Transaction History" badge={String(txHistory.length)}>
            <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
              {txHistory.length === 0 && <p className="text-[0.73rem] text-eve-muted/80">No submissions yet.</p>}
              {txHistory.map((tx) => (
                <div key={tx.digest} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <strong className="text-xs text-eve-cold break-all">{tx.digest}</strong>
                  <p className="text-[0.63rem] text-eve-muted mt-1">
                    {new Date(tx.ts).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/submit/page.tsx
git commit -m "feat: rewrite Submit page with on-chain PTB integration"
```

---

## Task 9: Bounties Page Rewrite (`/bounties`)

**Files:**
- Rewrite: `app/src/app/bounties/page.tsx`

- [ ] **Step 1: Rewrite Bounties page**

```typescript
// app/src/app/bounties/page.tsx
"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useBounties } from "@/hooks/use-bounties";
import { INTEL_TYPE_LABELS } from "@/lib/constants";

const DEADLINE_OPTIONS = [
  { label: "24h", ms: 86_400_000 },
  { label: "48h", ms: 172_800_000 },
  { label: "72h", ms: 259_200_000 },
  { label: "7d", ms: 604_800_000 },
];

export default function BountiesPage() {
  const account = useCurrentAccount();
  const { bounties, isLoading, createBounty, isCreating } = useBounties();

  const [regionId, setRegionId] = useState(0);
  const [sectorX, setSectorX] = useState(0);
  const [sectorY, setSectorY] = useState(0);
  const [sectorZ, setSectorZ] = useState(0);
  const [intelTypes, setIntelTypes] = useState<number[]>([1]);
  const [rewardSui, setRewardSui] = useState(1);
  const [deadlineMs, setDeadlineMs] = useState(DEADLINE_OPTIONS[2].ms);

  const onCreate = async () => {
    if (!account) return;
    await createBounty({
      targetRegion: { regionId, sectorX, sectorY, sectorZ, zoomLevel: 0 },
      intelTypesWanted: intelTypes,
      rewardMist: rewardSui * 1_000_000_000,
      deadlineMs: Date.now() + deadlineMs,
    });
  };

  const toggleIntelType = (type: number) => {
    setIntelTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <>
      <PageHeader
        title="BOUNTY COMMAND BOARD"
        subtitle="Create and track active operational bounties with payout-focused structure."
        metrics={[
          { label: "Active", value: String(bounties.length) },
          { label: "Status", value: isLoading ? "Loading" : "Ready" },
          { label: "Wallet", value: account ? "Connected" : "---" },
        ]}
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          <Panel title="Create Bounty" badge={account ? "Ready" : "Connect Wallet"}>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { label: "Region ID", value: regionId, set: setRegionId },
                { label: "Sector X", value: sectorX, set: setSectorX },
                { label: "Sector Y", value: sectorY, set: setSectorY },
                { label: "Sector Z", value: sectorZ, set: setSectorZ },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <p className="text-[0.66rem] text-eve-muted mb-1">{label}</p>
                  <input
                    className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                    type="number"
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                </div>
              ))}
            </div>

            <div className="mt-3">
              <p className="text-[0.66rem] text-eve-muted mb-1">Intel Types Wanted</p>
              <div className="flex gap-2">
                {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => {
                  const type = Number(k);
                  const active = intelTypes.includes(type);
                  return (
                    <button
                      key={k}
                      className={`border px-2 py-1.5 text-xs uppercase tracking-wide cursor-pointer ${
                        active
                          ? "border-eve-gold/60 text-eve-gold"
                          : "border-eve-panel-border text-eve-muted hover:text-eve-text"
                      }`}
                      onClick={() => toggleIntelType(type)}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Reward (SUI)</p>
                <input
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={rewardSui}
                  onChange={(e) => setRewardSui(Number(e.target.value))}
                />
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Deadline</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={deadlineMs}
                  onChange={(e) => setDeadlineMs(Number(e.target.value))}
                >
                  {DEADLINE_OPTIONS.map((opt) => (
                    <option key={opt.ms} value={opt.ms}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-4 py-2.5 uppercase tracking-wide cursor-pointer hover:border-eve-cold/50 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onCreate}
                disabled={!account || isCreating}
              >
                {isCreating ? "Creating..." : "Create Bounty"}
              </button>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          <Panel title="Active Bounties" badge={isLoading ? "loading" : String(bounties.length)}>
            {isLoading && <p className="mt-2 text-[0.73rem] text-eve-muted/80">Loading bounties...</p>}
            <div className="mt-2 grid gap-2 max-h-[500px] overflow-y-auto">
              {!isLoading && bounties.length === 0 && (
                <p className="text-[0.73rem] text-eve-muted/80">No active on-chain bounties.</p>
              )}
              {bounties.map((bounty, i) => (
                <div
                  key={bounty.id}
                  className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2 animate-slide-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs truncate">{bounty.id.slice(0, 16)}...</strong>
                    <RiskBadge severity={bounty.rewardAmount > 5_000_000_000 ? 8 : 4} />
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                    Reward: {(bounty.rewardAmount / 1_000_000_000).toFixed(2)} SUI
                  </p>
                  <p className="text-[0.63rem] text-eve-muted">
                    Types: {bounty.intelTypesWanted.map((t) => INTEL_TYPE_LABELS[t] ?? t).join(", ")}
                  </p>
                  <p className="text-[0.63rem] text-eve-muted">
                    Submissions: {bounty.submissionCount} | Status: {bounty.status}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/bounties/page.tsx
git commit -m "feat: rewrite Bounties page with on-chain create/list integration"
```

---

## Task 10: Subscribe Page Rewrite (`/subscribe`)

**Files:**
- Rewrite: `app/src/app/subscribe/page.tsx`

- [ ] **Step 1: Rewrite Subscribe page**

```typescript
// app/src/app/subscribe/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { MetricChip } from "@/components/ui/MetricChip";
import { useSubscription } from "@/hooks/use-subscription";

const COVERAGE_ZONES = [
  { id: "Z-A1", name: "Citadel Arc", free: "Delayed", premium: "Live" },
  { id: "Z-B4", name: "Refinery Spine", free: "Locked Depth", premium: "Deep Zoom" },
  { id: "Z-C8", name: "Outer Colony", free: "Basic Intel", premium: "Full Breakdown" },
  { id: "Z-D2", name: "Ancient Relay", free: "No Forecast", premium: "Predictive Alerts" },
];

const CAPABILITY_ROWS = [
  { cap: "Heatmap Refresh", free: "60s", premium: "10s" },
  { cap: "Map Zoom Depth", free: "Level 1", premium: "Level 2" },
  { cap: "Intel Breakdown", free: "Basic", premium: "Full" },
  { cap: "Bounty Signal Priority", free: "Standard Queue", premium: "Priority Queue" },
  { cap: "Route Forecast", free: "-", premium: "Enabled" },
];

export default function SubscribePage() {
  const account = useCurrentAccount();
  const { subscription, isPremium, isLoading, subscribe, isSubscribing } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "quarterly">("monthly");
  const [activeZone, setActiveZone] = useState(COVERAGE_ZONES[0].id);

  const expiresText = useMemo(() => {
    if (!subscription?.expiresAt) return "N/A";
    return new Date(subscription.expiresAt).toLocaleString();
  }, [subscription]);

  const statusLabel = useMemo(() => {
    if (isPremium) return "Active (Premium)";
    if (!subscription) return "Active (Basic)";
    if (!subscription.isActive) return "Expired";
    return "Standard";
  }, [isPremium, subscription]);

  const zone = COVERAGE_ZONES.find((z) => z.id === activeZone) ?? COVERAGE_ZONES[0];

  const onUpgrade = async () => {
    if (!account) return;
    const days = billingCycle === "monthly" ? 30 : 90;
    const priceMist = billingCycle === "monthly" ? 30_000_000_000 : 81_000_000_000;
    await subscribe({ days, priceMist });
  };

  return (
    <>
      <PageHeader
        title="MEMBERSHIP COMMAND"
        subtitle="Manage access tiers, coverage zones, and subscription status."
        variant="membership"
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          {/* Current Access */}
          <Panel title="Current Access Level" badge={isPremium ? "PREMIUM ACTIVE" : "FREE ACCESS"}>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MetricChip label="Tier" value={isPremium ? "Premium" : "Free"} />
              <MetricChip label="Status" value={statusLabel} />
              <MetricChip label="Expiry" value={expiresText} />
            </div>
            {isLoading && <p className="mt-2 text-[0.73rem] text-eve-muted/80">Syncing membership status...</p>}
          </Panel>

          {/* Coverage Zones */}
          <Panel title="Coverage Advantage Map" badge={zone.id}>
            <div className="mt-2 grid grid-cols-4 gap-2 max-lg:grid-cols-2">
              {COVERAGE_ZONES.map((z) => (
                <button
                  key={z.id}
                  className={`border text-left p-2 cursor-pointer ${
                    activeZone === z.id
                      ? "border-eve-gold/60 bg-[rgba(21,16,14,0.84)]"
                      : "border-eve-panel-border bg-[rgba(10,14,20,0.88)] hover:border-eve-panel-border"
                  }`}
                  onClick={() => setActiveZone(z.id)}
                >
                  <strong className="block text-xs text-eve-cold">{z.id}</strong>
                  <span className="text-[0.64rem] text-eve-muted">{z.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 border border-eve-panel-border/50 bg-[rgba(8,11,16,0.84)] p-2">
              <div className="flex items-center justify-between">
                <strong className="text-xs">{zone.name}</strong>
                <span className="text-[0.66rem] text-eve-muted">Feature Delta</span>
              </div>
              <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                Free: {zone.free} | Premium: {zone.premium}
              </p>
            </div>
          </Panel>

          {/* Plans */}
          <Panel title="Plan Selection" badge="2 tiers">
            <div className="mt-2 flex gap-2">
              {(["monthly", "quarterly"] as const).map((cycle) => (
                <button
                  key={cycle}
                  className={`border px-3 py-2 text-xs uppercase tracking-wide cursor-pointer ${
                    billingCycle === cycle
                      ? "border-eve-gold/60 text-eve-gold"
                      : "border-eve-panel-border text-eve-muted hover:text-eve-text"
                  }`}
                  onClick={() => setBillingCycle(cycle)}
                >
                  {cycle} Billing
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {/* Free Plan */}
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-3">
                <div className="flex justify-between items-center">
                  <strong className="text-sm">Free</strong>
                  <span className="text-xs text-eve-muted">0 SUI</span>
                </div>
                <ul className="mt-2 text-[0.73rem] text-eve-muted/80 list-disc pl-4 space-y-1">
                  <li>Zoom Level 0-1</li>
                  <li>Delayed intel refresh</li>
                </ul>
                <button className="mt-3 w-full border border-eve-panel-border text-eve-muted text-xs py-2 uppercase cursor-default">
                  Current Base Tier
                </button>
              </div>
              {/* Premium Plan */}
              <div className="border border-eve-gold/60 bg-gradient-to-b from-[rgba(28,21,16,0.9)] to-[rgba(13,11,10,0.9)] p-3 animate-glow-pulse">
                <div className="flex justify-between items-center">
                  <strong className="text-sm">Premium</strong>
                  <span className="text-xs text-eve-gold">
                    {billingCycle === "quarterly" ? "81 SUI / 90d" : "30 SUI / 30d"}
                  </span>
                </div>
                <ul className="mt-2 text-[0.73rem] text-eve-muted/80 list-disc pl-4 space-y-1">
                  <li>Zoom Level 0-2</li>
                  <li>10s live refresh</li>
                </ul>
                <button
                  className="mt-3 w-full border border-eve-gold/90 text-[#fff5e8] text-xs py-2 uppercase cursor-pointer bg-gradient-to-b from-[rgba(165,109,57,0.72)] to-[rgba(77,48,23,0.72)] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onUpgrade}
                  disabled={!account || isSubscribing}
                >
                  {isSubscribing ? "Processing..." : "Upgrade Membership"}
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start sticky top-4">
          <Panel title="Billing Summary" badge="Ledger">
            <div className="mt-2 grid gap-2">
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <div className="flex justify-between">
                  <strong className="text-xs">Current Cycle</strong>
                  <span className="text-[0.66rem] text-eve-muted">{billingCycle}</span>
                </div>
                <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                  {isPremium ? "Premium charges renew unless canceled." : "No active paid membership."}
                </p>
              </div>
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <div className="flex justify-between">
                  <strong className="text-xs">Wallet Access</strong>
                  <span className="text-[0.66rem] text-eve-muted">{subscription?.nftId ? "Bound" : "Unbound"}</span>
                </div>
                <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                  {subscription?.nftId ? `NFT: ${subscription.nftId.slice(0, 12)}...` : "Bind wallet after first premium activation."}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Capability Matrix */}
      <Panel title="Capability Matrix" badge="Comparison" className="mt-3">
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-eve-panel-border/50 px-2 py-2 text-left text-eve-info bg-[rgba(18,23,32,0.84)]">Capability</th>
                <th className="border border-eve-panel-border/50 px-2 py-2 text-left text-eve-info bg-[rgba(18,23,32,0.84)]">Free</th>
                <th className="border border-eve-panel-border/50 px-2 py-2 text-left text-eve-info bg-[rgba(18,23,32,0.84)]">Premium</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_ROWS.map((row) => (
                <tr key={row.cap}>
                  <td className="border border-eve-panel-border/50 px-2 py-2 text-eve-muted/80">{row.cap}</td>
                  <td className="border border-eve-panel-border/50 px-2 py-2 text-eve-muted/80">{row.free}</td>
                  <td className="border border-eve-panel-border/50 px-2 py-2 text-eve-muted/80">{row.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/subscribe/page.tsx
git commit -m "feat: rewrite Subscribe page with on-chain upgrade flow"
```

---

## Task 11: Store Page Rewrite (`/store`)

**Files:**
- Rewrite: `app/src/app/store/page.tsx`

- [ ] **Step 1: Rewrite Store page**

```typescript
// app/src/app/store/page.tsx
"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { plugins } from "@/lib/mock-data";

type PluginCategory = "Intel" | "Economy" | "Signals";

const CATEGORY_MAP: Record<string, PluginCategory> = {
  trace: "Intel",
  auction: "Economy",
  civil: "Intel",
  relay: "Signals",
};

const PRICE_MAP: Record<string, string> = {
  trace: "12 SUI / 30d",
  auction: "9 SUI / 30d",
  civil: "7 SUI / 30d",
  relay: "15 SUI / 30d",
};

const INITIAL_SLOTS = [
  { id: "S1", label: "Tactical Core", role: "Intel Only", pluginId: null as string | null },
  { id: "S2", label: "Economic Engine", role: "Economy Only", pluginId: null as string | null },
  { id: "S3", label: "Signal Bay", role: "Signals Only", pluginId: null as string | null },
  { id: "S4", label: "Auxiliary Dock", role: "Flexible", pluginId: null as string | null },
];

export default function StorePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | PluginCategory>("All");
  const [selected, setSelected] = useState(plugins[0]?.id ?? "");
  const [slots, setSlots] = useState(INITIAL_SLOTS);
  const [activeSlotId, setActiveSlotId] = useState(INITIAL_SLOTS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((p) => {
      const cat = CATEGORY_MAP[p.id];
      if (activeCategory !== "All" && cat !== activeCategory) return false;
      if (q && !p.label.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, activeCategory]);

  const selectedPlugin = plugins.find((p) => p.id === selected) ?? null;
  const activeSlot = slots.find((s) => s.id === activeSlotId) ?? slots[0];

  const canEquip = (() => {
    if (!selectedPlugin) return false;
    const cat = CATEGORY_MAP[selectedPlugin.id];
    if (activeSlot.role === "Flexible") return true;
    if (activeSlot.role === "Intel Only") return cat === "Intel";
    if (activeSlot.role === "Economy Only") return cat === "Economy";
    if (activeSlot.role === "Signals Only") return cat === "Signals";
    return false;
  })();

  const equipToSlot = () => {
    if (!selectedPlugin || !canEquip) return;
    setSlots((prev) => prev.map((s) => (s.id === activeSlot.id ? { ...s, pluginId: selectedPlugin.id } : s)));
  };

  const clearSlot = () => {
    setSlots((prev) => prev.map((s) => (s.id === activeSlot.id ? { ...s, pluginId: null } : s)));
  };

  return (
    <>
      <PageHeader
        title="PLUGIN MARKETPLACE"
        subtitle="Plugin catalog with category filters, preview, and multi-slot loadout system."
        variant="store"
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          {/* Filters */}
          <Panel title="Catalog Filters" badge={`${plugins.length} modules`}>
            <div className="mt-2 grid gap-2">
              <input
                className="w-full border border-eve-info/60 bg-[rgba(20,28,41,0.96)] text-eve-text font-mono text-xs px-2.5 py-2 placeholder:text-eve-muted/60"
                placeholder="Search plugin..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                {(["All", "Intel", "Economy", "Signals"] as const).map((cat) => (
                  <button
                    key={cat}
                    className={`border px-2.5 py-1.5 text-xs uppercase tracking-wide cursor-pointer ${
                      activeCategory === cat
                        ? "border-eve-gold/60 text-eve-gold"
                        : "border-eve-panel-border text-eve-muted hover:text-eve-text"
                    }`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* Plugin Catalog */}
          <Panel title="Plugin Catalog" badge={`${filtered.length} results`}>
            <div className="mt-2 grid gap-2 max-h-96 overflow-y-auto">
              {filtered.map((plugin) => {
                const cat = CATEGORY_MAP[plugin.id];
                const isSelected = selected === plugin.id;
                return (
                  <button
                    key={plugin.id}
                    className={`border p-2 text-left w-full cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? "border-eve-glow bg-[rgba(14,21,31,0.84)] shadow-[inset_0_0_0_1px_rgba(122,176,227,0.3)]"
                        : "border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] hover:border-eve-panel-border hover:-translate-y-px"
                    }`}
                    onClick={() => setSelected(plugin.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs">{plugin.label}</strong>
                      <span className="text-[0.66rem] text-eve-muted">{cat}</span>
                    </div>
                    <p className="mt-1 text-[0.73rem] text-eve-muted/80">{plugin.description}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{plugin.effect}</span>
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{PRICE_MAP[plugin.id]}</span>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-[0.73rem] text-eve-muted/80">No plugins matched filters.</p>}
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          {/* Preview */}
          <Panel title="Plugin Preview" badge={selectedPlugin?.id.toUpperCase() ?? "none"}>
            {selectedPlugin ? (
              <>
                <h3 className="mt-2 text-base text-eve-cold">{selectedPlugin.label}</h3>
                <p className="mt-1 text-[0.73rem] text-eve-muted/80">{selectedPlugin.description}</p>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{CATEGORY_MAP[selectedPlugin.id]}</span>
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{selectedPlugin.effect}</span>
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{PRICE_MAP[selectedPlugin.id]}</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[0.73rem] text-eve-muted/80">Select a plugin to inspect.</p>
            )}
          </Panel>

          {/* Loadout Slots */}
          <Panel title="Loadout Slots" badge={`${slots.filter((s) => s.pluginId).length} / ${slots.length}`}>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {slots.map((slot) => {
                const plugged = plugins.find((p) => p.id === slot.pluginId);
                const isActive = slot.id === activeSlotId;
                return (
                  <button
                    key={slot.id}
                    className={`border p-2.5 text-left cursor-pointer transition-all min-h-[100px] ${
                      plugged
                        ? "border-eve-gold/60 bg-gradient-to-b from-[rgba(22,20,17,0.86)] to-[rgba(13,11,9,0.9)] border-solid"
                        : "border-eve-panel-border/40 bg-gradient-to-b from-[rgba(12,18,26,0.9)] to-[rgba(8,11,16,0.92)] border-dashed"
                    } ${isActive ? "border-eve-glow shadow-[inset_0_0_0_1px_rgba(122,176,227,0.35)]" : ""}`}
                    onClick={() => setActiveSlotId(slot.id)}
                  >
                    <div className="flex justify-between items-center">
                      <strong className="text-sm text-eve-cold">{slot.id}</strong>
                      <span className="text-[0.66rem] text-eve-muted">{slot.role}</span>
                    </div>
                    <p className="text-[0.67rem] text-eve-info mt-1">{slot.label}</p>
                    <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                      {plugged ? plugged.label : `[Empty] ${slot.id}`}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Slot Control */}
            <div className="mt-2 border border-eve-panel-border/50 bg-[rgba(8,11,16,0.84)] p-2">
              <div className="flex justify-between">
                <strong className="text-xs">{activeSlot.id} Control</strong>
                <span className="text-[0.66rem] text-eve-muted">{activeSlot.role}</span>
              </div>
              {!canEquip && selectedPlugin && (
                <p className="mt-1 text-[0.66rem] text-eve-warn">Category mismatch for this slot.</p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="border border-eve-gold/60 text-eve-gold text-xs px-3 py-1.5 uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={equipToSlot}
                  disabled={!selectedPlugin || !canEquip}
                >
                  Equip to {activeSlot.id}
                </button>
                <button
                  className="border border-eve-panel-border text-eve-muted text-xs px-3 py-1.5 uppercase cursor-pointer hover:text-eve-text"
                  onClick={clearSlot}
                >
                  Clear
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add next-monorepo/app/src/app/store/page.tsx
git commit -m "feat: rewrite Store page with Tailwind + plugin loadout system"
```

---

## Task 12: Cleanup + Final Verification

**Files:**
- Delete: `app/src/lib/mock-data.ts` (only after confirming Dashboard + Store still import what they need)
- Run: all tests

- [ ] **Step 1: Verify mock-data.ts usage**

Dashboard (`page.tsx`) still imports `headlines` and `timelineEvents` from mock-data (static content per spec).
Store (`store/page.tsx`) still imports `plugins` from mock-data.

These imports are intentional. Do NOT delete `mock-data.ts` — it's still used for static editorial content. Remove only the `intelFeed` and `subscriptionPlans` exports if no page imports them.

```bash
cd next-monorepo/app && grep -r "mock-data" src/app/ --include="*.tsx"
```

Expected: `page.tsx` and `store/page.tsx` still import from mock-data.

- [ ] **Step 2: Clean unused mock exports**

If `intelFeed` and `subscriptionPlans` are no longer imported by any page, remove those exports from `mock-data.ts` but keep `headlines`, `timelineEvents`, and `plugins`.

- [ ] **Step 3: Run type check**

```bash
cd next-monorepo/app && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
cd next-monorepo && npm test
```

Expected: All existing tests pass. Some tests that reference ShellFrame or old CSS classes may fail — fix those by updating the imports.

- [ ] **Step 5: Fix any broken tests**

Update test files that import `ShellFrame` or `riskClass` to use new components. Tests that mock these should be updated to mock `Panel`, `RiskBadge`, etc.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: cleanup unused mock exports, fix test imports after UI redesign"
```

---

## Design Deviations

| Spec | Plan Deviation | Reason |
|---|---|---|
| "Delete globals.css" | Replace content, keep file | Tailwind needs a CSS entry point with `@import "tailwindcss"` |
| "Delete mock-data.ts" | Keep with reduced exports | Dashboard headlines/timeline and Store plugins are static content with no backend endpoint |
| deck.gl HeatmapLayer | Placeholder grid view | Full deck.gl rendering requires coordinate mapping — placeholder shows cell data, real layer can be swapped in |
| Topbar in AppShell | Topbar in PageHeader (per-page) | Allows per-page variant theming (store=blue, membership=gold). Each page renders `<PageHeader>` which includes the topbar. |
