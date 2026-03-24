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
    const { container } = render(<PlayerCard address="0xabc" />);
    expect(container.querySelector('[data-testid="player-card-skeleton"]')).not.toBeNull();
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
    expect(screen.getByText("murphy")).toBeDefined();
    expect(screen.getByText(/tribe #1000167/)).toBeDefined();
    expect(screen.getByText("utopia")).toBeDefined();
    expect(screen.getByText(/2112000186/)).toBeDefined();
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
    expect(screen.getAllByText(/0xunknow/).length).toBeGreaterThan(0);
    expect(screen.queryByText("tribe")).toBeNull();
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
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("avatar.png");
  });
});
