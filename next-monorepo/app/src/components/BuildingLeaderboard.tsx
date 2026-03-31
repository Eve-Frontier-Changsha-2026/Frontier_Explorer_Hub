"use client";

import { Panel } from "@/components/ui/Panel";
import type { LeaderboardEntry } from "@/types";

interface Props {
  entries: LeaderboardEntry[] | null;
  isLoading?: boolean;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function BuildingLeaderboard({ entries, isLoading }: Props) {
  if (isLoading || entries === null) {
    return (
      <Panel title="Building Leaderboard" badge="EVE EYES">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60 animate-pulse-dot">Loading...</p>
      </Panel>
    );
  }

  if (entries.length === 0) {
    return (
      <Panel title="Building Leaderboard" badge="EVE EYES">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60">No building data available</p>
      </Panel>
    );
  }

  return (
    <Panel title="Building Leaderboard" badge="EVE EYES">
      <div className="mt-2 grid gap-1">
        {entries.map((entry) => (
          <div
            key={entry.walletAddress}
            className="flex items-center justify-between border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-[0.66rem] text-eve-muted/50 w-5 text-right">
                #{entry.rank}
              </span>
              <span className="text-xs text-eve-gold">
                {entry.username || truncateAddr(entry.walletAddress)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{entry.buildingCount}</span>
              <span className="text-[0.6rem] text-eve-muted/50 border border-eve-panel-border/30 px-1 py-0.5">
                {truncateAddr(entry.walletAddress)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
