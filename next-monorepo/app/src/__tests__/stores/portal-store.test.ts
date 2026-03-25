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
