import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/Sidebar";

vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => null,
  ConnectButton: () => <button>Connect Wallet</button>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isPremium: false }),
}));

describe("Sidebar", () => {
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

  it("hides labels when collapsed", () => {
    render(<Sidebar collapsed={true} />);
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("shows connect button when no wallet", () => {
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText("Connect Wallet")).toBeDefined();
  });
});
