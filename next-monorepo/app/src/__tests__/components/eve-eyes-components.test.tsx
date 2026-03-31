import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuildingLeaderboard } from "@/components/BuildingLeaderboard";
import { EcosystemStatus } from "@/components/EcosystemStatus";
import type { LeaderboardEntry, EcosystemFeature } from "@/types";

describe("BuildingLeaderboard", () => {
  const entries: LeaderboardEntry[] = [
    { rank: 1, tenant: "utopia", ownerCharacterItemId: "1", userId: "1", walletAddress: "0xad0221857e57908707762a74b68e6f340b06a6e9f991c270ae9c06cf1a92fb71", buildingCount: 54, lastSeenAt: "2026-03-26T12:48:36Z", username: "lacal" },
    { rank: 2, tenant: "utopia", ownerCharacterItemId: "2", userId: "2", walletAddress: "0xff0932fca8fa5ce33289f347278b2fc1201fbfa0f91aac76912a7f5e161b0f47", buildingCount: 14, lastSeenAt: "2026-03-16T16:00:16Z", username: "Warkus" },
  ];

  it("renders leaderboard entries", () => {
    render(<BuildingLeaderboard entries={entries} />);
    expect(screen.getByText("lacal")).toBeTruthy();
    expect(screen.getByText("Warkus")).toBeTruthy();
    expect(screen.getByText("54")).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
  });

  it("renders empty state", () => {
    render(<BuildingLeaderboard entries={[]} />);
    expect(screen.getByText(/no building data/i)).toBeTruthy();
  });

  it("renders loading state", () => {
    render(<BuildingLeaderboard entries={null} isLoading />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});

describe("EcosystemStatus", () => {
  const features: EcosystemFeature[] = [
    { title: "Atlas", href: "/atlas", description: "Search systems", metric: "24502 systems", supporting: "2213 constellations", status: "live" },
    { title: "Jumps", href: "/jumps", description: "Travel history", metric: "Token required", supporting: "", status: "locked" },
  ];

  it("renders feature cards", () => {
    render(<EcosystemStatus features={features} />);
    expect(screen.getByText("Atlas")).toBeTruthy();
    expect(screen.getByText("Jumps")).toBeTruthy();
    expect(screen.getByText("24502 systems")).toBeTruthy();
  });

  it("shows live/locked badges", () => {
    render(<EcosystemStatus features={features} />);
    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.getByText("LOCKED")).toBeTruthy();
  });

  it("renders empty state", () => {
    render(<EcosystemStatus features={null} isLoading />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });
});
