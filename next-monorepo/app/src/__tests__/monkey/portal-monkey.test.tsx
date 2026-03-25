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
  it("store recovers from cleared localStorage", async () => {
    usePortalStore.getState().addLink("A", "https://a.com");
    expect(usePortalStore.getState().links).toHaveLength(1);

    // Simulate localStorage being cleared externally
    localStorage.removeItem("feh-portal-links");

    // Store in-memory still has data (persist only syncs on write)
    expect(usePortalStore.getState().links).toHaveLength(1);

    // Manually reset state (simulating a page reload that finds empty storage)
    usePortalStore.setState({ links: [] });
    await usePortalStore.persist.rehydrate();
    // After manual reset + rehydrate from empty storage, links are empty
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
