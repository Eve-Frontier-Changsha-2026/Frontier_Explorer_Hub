# Portal — Custom URL Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Portal feature that lets users bookmark and embed external URLs via iframes, with a list+preview split view, fullscreen routes, and localStorage persistence.

**Architecture:** Zustand store with `persist` middleware for link CRUD + localStorage. Three Next.js app router pages: `/portal` (split view), `/portal/[id]` (fullscreen), `/portal/view` (fallback). Pure URL validation utility shared across store and pages.

**Tech Stack:** Next.js 14 app router, Zustand 5 + persist, Vitest + Testing Library, Tailwind (EVE theme)

**Spec:** `docs/superpowers/specs/2026-03-25-portal-url-embed-design.md`

---

## File Structure

```
src/
├── lib/
│   └── portal-url.ts                        # URL validation utility (validatePortalUrl)
├── stores/
│   └── portal-store.ts                      # Zustand store with persist middleware
├── components/portal/
│   ├── PortalLinkList.tsx                    # Left panel: link items + add + delete + reorder
│   ├── PortalPreview.tsx                     # Right panel: iframe preview with load detection
│   ├── AddLinkDialog.tsx                     # Inline form for adding new links
│   ├── PortalEmptyState.tsx                  # Empty state with guidance
│   └── PortalFullscreenBar.tsx               # Top bar for fullscreen pages (name + url + actions)
├── app/portal/
│   ├── page.tsx                              # Split view page
│   └── [id]/
│       └── page.tsx                          # Fullscreen by store ID
├── app/portal/view/
│   └── page.tsx                              # Fallback fullscreen by query params
├── components/Sidebar.tsx                    # MODIFY: add Portal nav item + startsWith active check
├── __tests__/
│   ├── lib/portal-url.test.ts               # URL validation unit tests
│   ├── stores/portal-store.test.ts          # Store CRUD + persist tests
│   ├── components/portal-components.test.tsx # Component integration tests
│   └── monkey/portal-monkey.test.tsx         # Extreme edge case tests
```

---

### Task 1: URL Validation Utility (TDD)

**Files:**
- Create: `src/lib/portal-url.ts`
- Test: `src/__tests__/lib/portal-url.test.ts`

- [ ] **Step 1: Write failing tests for URL validation**

```ts
// src/__tests__/lib/portal-url.test.ts
import { describe, it, expect } from "vitest";
import { validatePortalUrl } from "@/lib/portal-url";

describe("validatePortalUrl", () => {
  it("accepts valid https URL", () => {
    expect(validatePortalUrl("https://example.com")).toEqual({ valid: true });
  });

  it("accepts https URL with path and query", () => {
    expect(validatePortalUrl("https://example.com/path?q=1#hash")).toEqual({ valid: true });
  });

  it("accepts https IP-based URL", () => {
    expect(validatePortalUrl("https://192.168.1.1")).toEqual({ valid: true });
  });

  it("accepts http://localhost for dev", () => {
    expect(validatePortalUrl("http://localhost:3000")).toEqual({ valid: true });
  });

  it("rejects http (non-localhost)", () => {
    const r = validatePortalUrl("http://example.com");
    expect(r.valid).toBe(false);
    expect(r.error).toContain("https");
  });

  it("rejects javascript: scheme", () => {
    const r = validatePortalUrl("javascript:alert(1)");
    expect(r.valid).toBe(false);
  });

  it("rejects data: scheme", () => {
    const r = validatePortalUrl("data:text/html,<h1>hi</h1>");
    expect(r.valid).toBe(false);
  });

  it("rejects blob: scheme", () => {
    const r = validatePortalUrl("blob:https://example.com/uuid");
    expect(r.valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validatePortalUrl("").valid).toBe(false);
  });

  it("rejects URL exceeding 2048 chars", () => {
    const long = "https://example.com/" + "a".repeat(2030);
    expect(validatePortalUrl(long).valid).toBe(false);
  });

  it("rejects non-URL string", () => {
    expect(validatePortalUrl("not a url").valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/lib/portal-url.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validatePortalUrl**

```ts
// src/lib/portal-url.ts
type ValidationResult = { valid: true } | { valid: false; error: string };

const BLOCKED_SCHEMES = ["javascript:", "data:", "blob:"];
const MAX_URL_LENGTH = 2048;

export function validatePortalUrl(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: "URL is required" };
  if (trimmed.length > MAX_URL_LENGTH) return { valid: false, error: "URL exceeds 2048 characters" };

  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) return { valid: false, error: `${scheme} URLs are not allowed` };
  }

  // Allow http://localhost for dev
  const isLocalhost = lower.startsWith("http://localhost");
  if (!isLocalhost && !lower.startsWith("https://")) {
    return { valid: false, error: "Only https:// URLs are allowed" };
  }

  try {
    new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/lib/portal-url.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal-url.ts src/__tests__/lib/portal-url.test.ts
git commit -m "feat(portal): add URL validation utility with TDD"
```

---

### Task 2: Portal Zustand Store with Persist (TDD)

**Files:**
- Create: `src/stores/portal-store.ts`
- Test: `src/__tests__/stores/portal-store.test.ts`
- Reference: `src/stores/map-store.ts` (existing store pattern), `src/stores/ui-store.ts`

- [ ] **Step 1: Write failing tests for store CRUD**

```ts
// src/__tests__/stores/portal-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { usePortalStore } from "@/stores/portal-store";

beforeEach(() => {
  usePortalStore.setState({ links: [] });
});

describe("portal-store", () => {
  it("starts with empty links", () => {
    expect(usePortalStore.getState().links).toEqual([]);
  });

  it("addLink creates a new link with auto-generated fields", () => {
    usePortalStore.getState().addLink("Test", "https://example.com");
    const links = usePortalStore.getState().links;
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("Test");
    expect(links[0].url).toBe("https://example.com");
    expect(links[0].id).toBeTruthy();
    expect(links[0].createdAt).toBeGreaterThan(0);
    expect(links[0].order).toBe(0);
  });

  it("addLink assigns incrementing order", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    usePortalStore.getState().addLink("B", "https://b.com");
    const links = usePortalStore.getState().links;
    expect(links[0].order).toBe(0);
    expect(links[1].order).toBe(1);
  });

  it("addLink rejects invalid URL and returns null", () => {
    const id = usePortalStore.getState().addLink("Bad", "javascript:alert(1)");
    expect(id).toBeNull();
    expect(usePortalStore.getState().links).toHaveLength(0);
  });

  it("addLink detects duplicate URL and returns null", () => {
    usePortalStore.getState().addLink("A", "https://example.com");
    const id = usePortalStore.getState().addLink("B", "https://example.com");
    expect(id).toBeNull();
    expect(usePortalStore.getState().links).toHaveLength(1);
  });

  it("removeLink deletes by id", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    const id = usePortalStore.getState().links[0].id;
    usePortalStore.getState().removeLink(id);
    expect(usePortalStore.getState().links).toHaveLength(0);
  });

  it("removeLink with nonexistent id is a no-op", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    usePortalStore.getState().removeLink("nonexistent");
    expect(usePortalStore.getState().links).toHaveLength(1);
  });

  it("updateLink patches name", () => {
    usePortalStore.getState().addLink("Old", "https://a.com");
    const id = usePortalStore.getState().links[0].id;
    usePortalStore.getState().updateLink(id, { name: "New" });
    expect(usePortalStore.getState().links[0].name).toBe("New");
  });

  it("updateLink patches url with validation", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    const id = usePortalStore.getState().links[0].id;
    const ok = usePortalStore.getState().updateLink(id, { url: "https://b.com" });
    expect(ok).toBe(true);
    expect(usePortalStore.getState().links[0].url).toBe("https://b.com");
  });

  it("updateLink rejects invalid url patch", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    const id = usePortalStore.getState().links[0].id;
    const ok = usePortalStore.getState().updateLink(id, { url: "data:bad" });
    expect(ok).toBe(false);
    expect(usePortalStore.getState().links[0].url).toBe("https://a.com");
  });

  it("reorderLinks reorders by id array", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    usePortalStore.getState().addLink("B", "https://b.com");
    usePortalStore.getState().addLink("C", "https://c.com");
    const [a, b, c] = usePortalStore.getState().links;
    usePortalStore.getState().reorderLinks([c.id, a.id, b.id]);
    const reordered = usePortalStore.getState().links;
    expect(reordered.map((l) => l.name)).toEqual(["C", "A", "B"]);
    expect(reordered[0].order).toBe(0);
    expect(reordered[1].order).toBe(1);
    expect(reordered[2].order).toBe(2);
  });

  it("getLinkById returns link or undefined", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    const id = usePortalStore.getState().links[0].id;
    expect(usePortalStore.getState().getLinkById(id)?.name).toBe("A");
    expect(usePortalStore.getState().getLinkById("nope")).toBeUndefined();
  });

  it("findByUrl returns existing link", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    expect(usePortalStore.getState().findByUrl("https://a.com")?.name).toBe("A");
    expect(usePortalStore.getState().findByUrl("https://b.com")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/stores/portal-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement portal store**

```ts
// src/stores/portal-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { validatePortalUrl } from "@/lib/portal-url";

export interface PortalLink {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  order: number;
}

export interface PortalState {
  links: PortalLink[];
  addLink: (name: string, url: string) => string | null;
  removeLink: (id: string) => void;
  updateLink: (id: string, patch: Partial<Pick<PortalLink, "name" | "url">>) => boolean;
  reorderLinks: (ids: string[]) => void;
  getLinkById: (id: string) => PortalLink | undefined;
  findByUrl: (url: string) => PortalLink | undefined;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set, get) => ({
      links: [],

      addLink: (name, url) => {
        if (!validatePortalUrl(url).valid) return null;
        if (get().links.some((l) => l.url === url)) return null;
        const id = crypto.randomUUID();
        set((s) => ({
          links: [
            ...s.links,
            { id, name, url, createdAt: Date.now(), order: s.links.length },
          ],
        }));
        return id;
      },

      removeLink: (id) =>
        set((s) => ({
          links: s.links
            .filter((l) => l.id !== id)
            .map((l, i) => ({ ...l, order: i })),
        })),

      updateLink: (id, patch) => {
        if (patch.url && !validatePortalUrl(patch.url).valid) return false;
        if (!get().links.some((l) => l.id === id)) return false;
        set((s) => ({
          links: s.links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
        return true;
      },

      reorderLinks: (ids) =>
        set((s) => {
          const byId = new Map(s.links.map((l) => [l.id, l]));
          const reordered: PortalLink[] = [];
          for (const id of ids) {
            const link = byId.get(id);
            if (link) reordered.push({ ...link, order: reordered.length });
          }
          // append any links not in ids array (safety)
          for (const link of s.links) {
            if (!ids.includes(link.id)) reordered.push({ ...link, order: reordered.length });
          }
          return { links: reordered };
        }),

      getLinkById: (id) => get().links.find((l) => l.id === id),
      findByUrl: (url) => get().links.find((l) => l.url === url),
    }),
    { name: "feh-portal-links" }
  )
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/stores/portal-store.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/portal-store.ts src/__tests__/stores/portal-store.test.ts
git commit -m "feat(portal): add Zustand store with persist middleware (TDD)"
```

---

### Task 3: Sidebar — Add Portal Nav Item

**Files:**
- Modify: `src/components/Sidebar.tsx:8-15` (NAV_ITEMS array), `src/components/Sidebar.tsx:48` (active check)
- Modify: `src/__tests__/components/sidebar.test.tsx` (update count assertion)

- [ ] **Step 1: Update sidebar test to expect 7 nav items**

In `src/__tests__/components/sidebar.test.tsx`, change the first test:

```ts
it("renders all 7 navigation items", () => {
  render(<Sidebar collapsed={false} />);
  expect(screen.getByText("Dashboard")).toBeDefined();
  expect(screen.getByText("Tactical Map")).toBeDefined();
  expect(screen.getByText("Submit Intel")).toBeDefined();
  expect(screen.getByText("Bounties")).toBeDefined();
  expect(screen.getByText("Membership")).toBeDefined();
  expect(screen.getByText("Plugin Store")).toBeDefined();
  expect(screen.getByText("Portal")).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/sidebar.test.tsx`
Expected: FAIL — "Portal" not found

- [ ] **Step 3: Add Portal to NAV_ITEMS and fix active check**

In `src/components/Sidebar.tsx`:

1. Add to `NAV_ITEMS` after Plugin Store:
```ts
{ path: "/portal", label: "Portal", icon: "M4 4h16v16H4zM9 4v16M4 9h5" },
```

2. Change the active check (line 48) from exact match to startsWith for `/portal`:
```ts
const active = item.path === "/"
  ? pathname === "/"
  : pathname.startsWith(item.path);
```

This ensures `/portal/[id]` and `/portal/view` also highlight the Portal nav item, while keeping Dashboard (`/`) as exact match to avoid highlighting on every page.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/sidebar.test.tsx`
Expected: All 3 tests PASS

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `cd next-monorepo/app && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/__tests__/components/sidebar.test.tsx
git commit -m "feat(portal): add Portal nav item to sidebar with startsWith active check"
```

---

### Task 4: Portal Components — EmptyState, FullscreenBar, AddLinkDialog

**Files:**
- Create: `src/components/portal/PortalEmptyState.tsx`
- Create: `src/components/portal/PortalFullscreenBar.tsx`
- Create: `src/components/portal/AddLinkDialog.tsx`

These are presentational components with minimal logic. Built together since they're small and self-contained.

- [ ] **Step 1: Create PortalEmptyState**

```tsx
// src/components/portal/PortalEmptyState.tsx
export function PortalEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
      <svg viewBox="0 0 24 24" className="w-10 h-10 text-eve-muted/40" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M4 4h16v16H4zM9 4v16M4 9h5" />
      </svg>
      <p className="text-sm text-eve-muted">No portal links yet</p>
      <p className="text-xs text-eve-muted/60">
        Add external tools, dashboards, or resources to access them from one place.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create PortalFullscreenBar**

```tsx
// src/components/portal/PortalFullscreenBar.tsx
"use client";

import Link from "next/link";

interface PortalFullscreenBarProps {
  name: string;
  url: string;
  onAddToPortal?: () => void; // only for /portal/view fallback route
}

export function PortalFullscreenBar({ name, url, onAddToPortal }: PortalFullscreenBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-eve-panel-border bg-eve-panel">
      <Link
        href="/portal"
        className="text-eve-muted hover:text-eve-text text-xs border border-eve-panel-border px-2 py-1"
      >
        ← Back
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-eve-cold truncate">{name}</p>
        <p className="text-[0.66rem] text-eve-muted truncate">{url}</p>
      </div>
      {onAddToPortal && (
        <button
          onClick={onAddToPortal}
          className="text-xs border border-eve-gold/60 text-eve-gold px-2.5 py-1 cursor-pointer hover:bg-eve-gold/10"
        >
          + Add to Portal
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs border border-eve-panel-border text-eve-muted px-2.5 py-1 hover:text-eve-text"
      >
        Open in Tab ↗
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Create AddLinkDialog**

```tsx
// src/components/portal/AddLinkDialog.tsx
"use client";

import { useState } from "react";
import { validatePortalUrl } from "@/lib/portal-url";
import { usePortalStore } from "@/stores/portal-store";

interface AddLinkDialogProps {
  onClose: () => void;
  onAdded?: (id: string) => void;
}

export function AddLinkDialog({ onClose, onAdded }: AddLinkDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const addLink = usePortalStore((s) => s.addLink);
  const findByUrl = usePortalStore((s) => s.findByUrl);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) { setError("Name is required"); return; }

    const validation = validatePortalUrl(trimmedUrl);
    if (!validation.valid) { setError(validation.error); return; }

    const existing = findByUrl(trimmedUrl);
    if (existing) { setError(`URL already exists as "${existing.name}"`); return; }

    const id = addLink(trimmedName, trimmedUrl);
    if (id) {
      onAdded?.(id);
      onClose();
    }
  };

  return (
    <div className="border border-eve-info/40 bg-[rgba(14,21,31,0.95)] p-3 animate-slide-in">
      <h3 className="text-xs uppercase tracking-wide text-eve-cold mb-2">Add Portal Link</h3>
      <div className="grid gap-2">
        <input
          className="w-full border border-eve-panel-border bg-[rgba(20,28,41,0.96)] text-eve-text font-mono text-xs px-2.5 py-2 placeholder:text-eve-muted/60"
          placeholder="Link name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          autoFocus
        />
        <input
          className="w-full border border-eve-panel-border bg-[rgba(20,28,41,0.96)] text-eve-text font-mono text-xs px-2.5 py-2 placeholder:text-eve-muted/60"
          placeholder="https://..."
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); }}
        />
        {error && <p className="text-[0.7rem] text-eve-danger">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-xs border border-eve-panel-border text-eve-muted px-3 py-1.5 cursor-pointer hover:text-eve-text"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="text-xs border border-eve-gold/60 text-eve-gold px-3 py-1.5 cursor-pointer hover:bg-eve-gold/10"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/
git commit -m "feat(portal): add EmptyState, FullscreenBar, AddLinkDialog components"
```

---

### Task 5: Portal Components — LinkList and Preview

**Files:**
- Create: `src/components/portal/PortalLinkList.tsx`
- Create: `src/components/portal/PortalPreview.tsx`

- [ ] **Step 1: Create PortalLinkList**

```tsx
// src/components/portal/PortalLinkList.tsx
"use client";

import { useState } from "react";
import { usePortalStore } from "@/stores/portal-store";
import { AddLinkDialog } from "./AddLinkDialog";

interface PortalLinkListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PortalLinkList({ selectedId, onSelect }: PortalLinkListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const links = usePortalStore((s) => s.links);
  const removeLink = usePortalStore((s) => s.removeLink);
  const reorderLinks = usePortalStore((s) => s.reorderLinks);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const ids = links.map((l) => l.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderLinks(ids);
  };

  const moveDown = (index: number) => {
    if (index >= links.length - 1) return;
    const ids = links.map((l) => l.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    reorderLinks(ids);
  };

  const extractDomain = (url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  };

  return (
    <div className="flex flex-col gap-2">
      {links.length >= 20 && (
        <p className="text-[0.66rem] text-eve-warn px-1">You have 20+ links. Consider cleaning up unused ones.</p>
      )}
      <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
        {links.map((link, i) => (
          <button
            key={link.id}
            onClick={() => onSelect(link.id)}
            className={`group flex items-center gap-2 px-2.5 py-2 text-left w-full cursor-pointer border transition-all ${
              selectedId === link.id
                ? "border-eve-glow bg-[rgba(14,21,31,0.84)]"
                : "border-transparent hover:border-eve-panel-border/40 hover:bg-[rgba(8,11,16,0.6)]"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-eve-text truncate">{link.name}</p>
              <p className="text-[0.66rem] text-eve-muted truncate">{extractDomain(link.url)}</p>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); moveUp(i); }}
                className="text-eve-muted hover:text-eve-text text-[0.7rem] px-1"
                title="Move up"
              >↑</button>
              <button
                onClick={(e) => { e.stopPropagation(); moveDown(i); }}
                className="text-eve-muted hover:text-eve-text text-[0.7rem] px-1"
                title="Move down"
              >↓</button>
              <button
                onClick={(e) => { e.stopPropagation(); removeLink(link.id); }}
                className="text-eve-muted hover:text-eve-danger text-[0.7rem] px-1"
                title="Delete"
              >✕</button>
            </div>
          </button>
        ))}
      </div>

      {showAdd ? (
        <AddLinkDialog
          onClose={() => setShowAdd(false)}
          onAdded={(id) => onSelect(id)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full border border-dashed border-eve-panel-border text-eve-muted hover:text-eve-text hover:border-eve-info/40 text-xs py-2 cursor-pointer"
        >
          + Add Link
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PortalPreview with iframe load detection**

```tsx
// src/components/portal/PortalPreview.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface PortalPreviewProps {
  url: string;
  name: string;
  linkId: string;
}

export function PortalPreview({ url, name, linkId }: PortalPreviewProps) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setStatus("loading");
    const timer = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "failed" : prev));
    }, 5000);

    const iframe = iframeRef.current;
    const handleLoad = () => {
      clearTimeout(timer);
      setStatus("loaded");
    };
    iframe?.addEventListener("load", handleLoad);

    return () => {
      clearTimeout(timer);
      iframe?.removeEventListener("load", handleLoad);
    };
  }, [url, retryKey]);

  const handleRetry = () => {
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-full min-h-[300px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-eve-panel-border">
        <p className="text-xs text-eve-cold truncate">{name}</p>
        <button
          onClick={() => router.push(`/portal/${linkId}`)}
          className="text-[0.66rem] text-eve-muted hover:text-eve-text border border-eve-panel-border px-2 py-0.5 cursor-pointer"
        >
          Fullscreen →
        </button>
      </div>

      <div className="flex-1 relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-eve-panel">
            <p className="text-xs text-eve-muted animate-pulse-dot">Loading...</p>
          </div>
        )}
        {status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-eve-panel gap-2">
            <p className="text-xs text-eve-muted">This site may not allow embedding</p>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="text-[0.66rem] border border-eve-panel-border text-eve-muted px-2 py-1 cursor-pointer hover:text-eve-text"
              >
                Retry
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.66rem] border border-eve-panel-border text-eve-muted px-2 py-1 hover:text-eve-text"
              >
                Open in Tab ↗
              </a>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={`${url}-${retryKey}`}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className={`w-full h-full border-0 ${status === "failed" ? "hidden" : ""}`}
          title={`Preview: ${name}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/PortalLinkList.tsx src/components/portal/PortalPreview.tsx
git commit -m "feat(portal): add PortalLinkList and PortalPreview with iframe load detection"
```

---

### Task 6: Portal Pages — Split View + Fullscreen + Fallback

**Files:**
- Create: `src/app/portal/page.tsx`
- Create: `src/app/portal/[id]/page.tsx`
- Create: `src/app/portal/view/page.tsx`
- Reference: `src/app/store/page.tsx` (split view layout pattern)

- [ ] **Step 1: Create `/portal` split view page**

```tsx
// src/app/portal/page.tsx
"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { usePortalStore } from "@/stores/portal-store";
import { PortalLinkList } from "@/components/portal/PortalLinkList";
import { PortalPreview } from "@/components/portal/PortalPreview";
import { PortalEmptyState } from "@/components/portal/PortalEmptyState";

export default function PortalPage() {
  const links = usePortalStore((s) => s.links);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first link on mount or when selection becomes invalid
  useEffect(() => {
    if (links.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !links.some((l) => l.id === selectedId)) {
      setSelectedId(links[0].id);
    }
  }, [links, selectedId]);

  const selectedLink = links.find((l) => l.id === selectedId);

  return (
    <>
      <PageHeader
        title="PORTAL"
        subtitle="Your external tools and dashboards, embedded in one place."
        variant="portal"
      />

      {links.length === 0 ? (
        <Panel title="Portal Links" className="mt-3">
          <PortalEmptyState />
        </Panel>
      ) : (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 max-lg:grid-cols-1">
          <Panel title="Links" badge={`${links.length}`}>
            <div className="mt-2">
              <PortalLinkList selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </Panel>

          <Panel title="Preview" badge={selectedLink?.name ?? "none"} className="min-h-[500px]">
            {selectedLink ? (
              <div className="mt-2 h-[calc(100%-1.5rem)]">
                <PortalPreview
                  url={selectedLink.url}
                  name={selectedLink.name}
                  linkId={selectedLink.id}
                />
              </div>
            ) : (
              <p className="mt-2 text-[0.73rem] text-eve-muted/80">Select a link to preview.</p>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create `/portal/[id]` fullscreen page**

```tsx
// src/app/portal/[id]/page.tsx
"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePortalStore } from "@/stores/portal-store";
import { useUIStore } from "@/stores/ui-store";
import { PortalFullscreenBar } from "@/components/portal/PortalFullscreenBar";

export default function PortalFullscreenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const getLinkById = usePortalStore((s) => s.getLinkById);
  const addToast = useUIStore((s) => s.addToast);
  const link = getLinkById(id);

  useEffect(() => {
    if (!link) {
      addToast({ type: "warning", message: "Portal link not found" });
      router.replace("/portal");
    }
  }, [link, router, addToast]);

  if (!link) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-eve-panel">
      <PortalFullscreenBar name={link.name} url={link.url} />
      <iframe
        src={link.url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className="flex-1 w-full border-0"
        title={link.name}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `/portal/view` fallback page**

```tsx
// src/app/portal/view/page.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { validatePortalUrl } from "@/lib/portal-url";
import { usePortalStore } from "@/stores/portal-store";
import { PortalFullscreenBar } from "@/components/portal/PortalFullscreenBar";

function PortalViewContent() {
  const params = useSearchParams();
  const router = useRouter();
  const addLink = usePortalStore((s) => s.addLink);

  const url = params.get("url");
  const name = params.get("name") || "Untitled";

  if (!url) {
    router.replace("/portal");
    return null;
  }

  const validation = validatePortalUrl(url);
  if (!validation.valid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-eve-panel">
        <p className="text-sm text-eve-danger">Invalid URL</p>
        <p className="text-xs text-eve-muted">{validation.error}</p>
        <button
          onClick={() => router.push("/portal")}
          className="text-xs border border-eve-panel-border text-eve-muted px-3 py-1.5 cursor-pointer hover:text-eve-text"
        >
          ← Back to Portal
        </button>
      </div>
    );
  }

  const handleAddToPortal = () => {
    const id = addLink(name, url);
    if (id) {
      router.push(`/portal/${id}`);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-eve-panel">
      <PortalFullscreenBar name={name} url={url} onAddToPortal={handleAddToPortal} />
      <iframe
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className="flex-1 w-full border-0"
        title={name}
      />
    </div>
  );
}

export default function PortalViewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-eve-panel" />}>
      <PortalViewContent />
    </Suspense>
  );
}
```

Note: `useSearchParams()` requires a `<Suspense>` boundary in Next.js 14 app router.

- [ ] **Step 4: Verify build compiles**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/
git commit -m "feat(portal): add split view, fullscreen, and fallback pages"
```

---

### Task 7: PageHeader — Support Portal Variant

**Files:**
- Modify: `src/components/PageHeader.tsx` (add "portal" to variant union if applicable)

- [ ] **Step 1: Check if PageHeader uses a variant union**

Read `src/components/PageHeader.tsx` and check if `variant` prop uses a string union type. If yes, add `"portal"` to it. If it accepts arbitrary strings, skip this task.

- [ ] **Step 2: Add portal variant (if needed)**

Add `"portal"` to the variant union and assign it a suitable color scheme (e.g., reuse `"store"` styling or use `eve-info`).

- [ ] **Step 3: Commit (if changes made)**

```bash
git add src/components/PageHeader.tsx
git commit -m "feat(portal): add portal variant to PageHeader"
```

---

### Task 8: Component Integration Tests

**Files:**
- Create: `src/__tests__/components/portal-components.test.tsx`

- [ ] **Step 1: Write integration tests**

```tsx
// src/__tests__/components/portal-components.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { usePortalStore } from "@/stores/portal-store";
import { AddLinkDialog } from "@/components/portal/AddLinkDialog";
import { PortalEmptyState } from "@/components/portal/PortalEmptyState";
import { PortalLinkList } from "@/components/portal/PortalLinkList";
import { PortalFullscreenBar } from "@/components/portal/PortalFullscreenBar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/portal",
  useParams: () => ({ id: "test-id" }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  usePortalStore.setState({ links: [] });
});

describe("PortalEmptyState", () => {
  it("renders guidance text", () => {
    render(<PortalEmptyState />);
    expect(screen.getByText("No portal links yet")).toBeDefined();
  });
});

describe("AddLinkDialog", () => {
  it("shows validation error for empty name", () => {
    const onClose = vi.fn();
    render(<AddLinkDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Name is required")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid URL", () => {
    const onClose = vi.fn();
    render(<AddLinkDialog onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("Link name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("https://..."), { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds valid link and calls onClose", () => {
    const onClose = vi.fn();
    const onAdded = vi.fn();
    render(<AddLinkDialog onClose={onClose} onAdded={onAdded} />);
    fireEvent.change(screen.getByPlaceholderText("Link name"), { target: { value: "Example" } });
    fireEvent.change(screen.getByPlaceholderText("https://..."), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onClose).toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalled();
    expect(usePortalStore.getState().links).toHaveLength(1);
  });

  it("shows error for duplicate URL", () => {
    usePortalStore.getState().addLink("Existing", "https://example.com");
    const onClose = vi.fn();
    render(<AddLinkDialog onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("Link name"), { target: { value: "Dup" } });
    fireEvent.change(screen.getByPlaceholderText("https://..."), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText(/already exists/)).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancel calls onClose without adding", () => {
    const onClose = vi.fn();
    render(<AddLinkDialog onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(usePortalStore.getState().links).toHaveLength(0);
  });
});

describe("PortalLinkList", () => {
  it("renders all links", () => {
    usePortalStore.getState().addLink("Alpha", "https://alpha.com");
    usePortalStore.getState().addLink("Beta", "https://beta.com");
    const onSelect = vi.fn();
    render(<PortalLinkList selectedId={null} onSelect={onSelect} />);
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
  });

  it("shows add button", () => {
    render(<PortalLinkList selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("+ Add Link")).toBeDefined();
  });

  it("clicking add button shows AddLinkDialog", () => {
    render(<PortalLinkList selectedId={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("+ Add Link"));
    expect(screen.getByText("Add Portal Link")).toBeDefined();
  });
});

describe("PortalFullscreenBar", () => {
  it("renders name, url, and back link", () => {
    render(<PortalFullscreenBar name="Test" url="https://example.com" />);
    expect(screen.getByText("Test")).toBeDefined();
    expect(screen.getByText("https://example.com")).toBeDefined();
    expect(screen.getByText("← Back")).toBeDefined();
  });

  it("shows Add to Portal button when onAddToPortal provided", () => {
    const onAdd = vi.fn();
    render(<PortalFullscreenBar name="Test" url="https://example.com" onAddToPortal={onAdd} />);
    const btn = screen.getByText("+ Add to Portal");
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalled();
  });

  it("hides Add to Portal button when onAddToPortal not provided", () => {
    render(<PortalFullscreenBar name="Test" url="https://example.com" />);
    expect(screen.queryByText("+ Add to Portal")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/portal-components.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/portal-components.test.tsx
git commit -m "test(portal): add component integration tests"
```

---

### Task 9: Monkey Tests — Extreme Edge Cases

**Files:**
- Create: `src/__tests__/monkey/portal-monkey.test.tsx`

- [ ] **Step 1: Write monkey tests**

```tsx
// src/__tests__/monkey/portal-monkey.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { usePortalStore } from "@/stores/portal-store";
import { validatePortalUrl } from "@/lib/portal-url";
import { AddLinkDialog } from "@/components/portal/AddLinkDialog";
import { PortalLinkList } from "@/components/portal/PortalLinkList";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/portal",
}));

beforeEach(() => {
  usePortalStore.setState({ links: [] });
});

describe("portal-monkey: URL validation edge cases", () => {
  it("rejects javascript: with mixed case", () => {
    expect(validatePortalUrl("JaVaScRiPt:alert(1)").valid).toBe(false);
  });

  it("rejects javascript: with leading spaces", () => {
    expect(validatePortalUrl("  javascript:alert(1)").valid).toBe(false);
  });

  it("rejects data: with base64", () => {
    expect(validatePortalUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==").valid).toBe(false);
  });

  it("handles URL with unicode characters", () => {
    expect(validatePortalUrl("https://例え.jp/path").valid).toBe(true);
  });

  it("handles URL with special query params", () => {
    expect(validatePortalUrl("https://x.com/search?q=<script>&t=1").valid).toBe(true);
  });

  it("rejects URL exactly at max length boundary + 1", () => {
    const atLimit = "https://example.com/" + "a".repeat(2048 - 20);
    expect(validatePortalUrl(atLimit).valid).toBe(true);
    const overLimit = atLimit + "b";
    expect(overLimit.length).toBeGreaterThan(2048);
    expect(validatePortalUrl(overLimit).valid).toBe(false);
  });
});

describe("portal-monkey: store stress", () => {
  it("rapid add/remove 50 links", () => {
    for (let i = 0; i < 50; i++) {
      usePortalStore.getState().addLink(`Link ${i}`, `https://example${i}.com`);
    }
    expect(usePortalStore.getState().links).toHaveLength(50);

    // Remove all odd-indexed
    const ids = usePortalStore.getState().links
      .filter((_, i) => i % 2 === 1)
      .map((l) => l.id);
    for (const id of ids) {
      usePortalStore.getState().removeLink(id);
    }
    expect(usePortalStore.getState().links).toHaveLength(25);

    // Orders should be contiguous 0..24
    const orders = usePortalStore.getState().links.map((l) => l.order);
    expect(orders).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it("reorderLinks with partial id list drops missing gracefully", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    usePortalStore.getState().addLink("B", "https://b.com");
    const [a] = usePortalStore.getState().links;
    // Only pass one id — the other should be appended
    usePortalStore.getState().reorderLinks([a.id]);
    expect(usePortalStore.getState().links).toHaveLength(2);
    expect(usePortalStore.getState().links[0].name).toBe("A");
    expect(usePortalStore.getState().links[1].name).toBe("B");
  });

  it("reorderLinks with bogus ids is safe", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    usePortalStore.getState().reorderLinks(["fake-1", "fake-2"]);
    // Original link appended as not-in-ids
    expect(usePortalStore.getState().links).toHaveLength(1);
    expect(usePortalStore.getState().links[0].name).toBe("A");
  });

  it("duplicate addLink with same URL returns null", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    const result = usePortalStore.getState().addLink("A2", "https://a.com");
    expect(result).toBeNull();
    expect(usePortalStore.getState().links).toHaveLength(1);
  });

  it("updateLink with nonexistent id returns false", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    const ok = usePortalStore.getState().updateLink("nonexistent", { name: "X" });
    expect(ok).toBe(false);
    expect(usePortalStore.getState().links[0].name).toBe("A");
  });
});

describe("portal-monkey: component edge cases", () => {
  it("AddLinkDialog: XSS in name is escaped", () => {
    const onClose = vi.fn();
    render(<AddLinkDialog onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("Link name"), {
      target: { value: '<img src=x onerror="alert(1)">' },
    });
    fireEvent.change(screen.getByPlaceholderText("https://..."), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByText("Add"));
    // If it didn't throw and the link was added, React safely escaped the name
    expect(usePortalStore.getState().links[0].name).toBe('<img src=x onerror="alert(1)">');
  });

  it("PortalLinkList: shows 20+ warning", () => {
    for (let i = 0; i < 21; i++) {
      usePortalStore.getState().addLink(`L${i}`, `https://l${i}.example.com`);
    }
    render(<PortalLinkList selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/20\+ links/)).toBeDefined();
  });

  it("PortalLinkList: empty list shows add button only", () => {
    render(<PortalLinkList selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("+ Add Link")).toBeDefined();
    expect(screen.queryByText("↑")).toBeNull();
  });
});

describe("portal-monkey: localStorage clear resilience", () => {
  it("store recovers from cleared localStorage", () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    expect(usePortalStore.getState().links).toHaveLength(1);

    // Simulate localStorage being cleared externally
    localStorage.removeItem("feh-portal-links");

    // Store in-memory still has data (persist only syncs on write)
    expect(usePortalStore.getState().links).toHaveLength(1);

    // After re-hydration (simulated by resetting state), links are gone
    usePortalStore.persist.rehydrate();
    // After rehydrate from empty storage, links should be empty
    expect(usePortalStore.getState().links).toHaveLength(0);
  });

  it("addLink works after localStorage clear + rehydrate", () => {
    localStorage.removeItem("feh-portal-links");
    usePortalStore.setState({ links: [] });
    const id = usePortalStore.getState().addLink("Fresh", "https://fresh.com");
    expect(id).toBeTruthy();
    expect(usePortalStore.getState().links).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run monkey tests**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/monkey/portal-monkey.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/monkey/portal-monkey.test.tsx
git commit -m "test(portal): add monkey tests for extreme edge cases"
```

---

### Task 10: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd next-monorepo/app && npx vitest run`
Expected: All tests pass (previous 101 + new portal tests)

- [ ] **Step 2: Type check**

Run: `cd next-monorepo/app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify sidebar test still passes with updated count**

Run: `cd next-monorepo/app && npx vitest run src/__tests__/components/sidebar.test.tsx`
Expected: PASS (now expects 7 nav items including Portal)

- [ ] **Step 4: Spot check all portal routes exist**

Verify these files exist:
- `src/app/portal/page.tsx`
- `src/app/portal/[id]/page.tsx`
- `src/app/portal/view/page.tsx`

- [ ] **Step 5: Commit any final fixes**

If any test or type errors found, fix and commit:
```bash
git commit -m "fix(portal): final verification fixes"
```
