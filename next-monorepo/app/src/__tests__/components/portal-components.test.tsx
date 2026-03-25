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
