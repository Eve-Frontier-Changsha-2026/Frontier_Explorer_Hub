"use client";

import type { WorldStatus } from "@/types";

interface Props {
  status: WorldStatus;
}

interface CellProps {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  stale?: boolean;
}

function StatusCell({ label, value, sub, color, stale }: CellProps) {
  return (
    <div className="flex-1 text-center border-r border-eve-panel-border/40 last:border-r-0 px-2 py-1.5">
      <div className={`text-[0.65rem] uppercase tracking-wider ${color}`}>
        {label}
        {stale && (
          <span className="ml-1 text-[0.55rem] text-eve-muted/60 border border-eve-muted/30 px-1 py-0.5 rounded">
            STALE
          </span>
        )}
      </div>
      <strong className={`block text-lg leading-tight ${stale ? "text-eve-muted/50" : ""}`}>
        {value}
      </strong>
      {sub && <div className="text-[0.6rem] text-eve-muted/60">{sub}</div>}
    </div>
  );
}

function isAnyStale(sources: { stale: boolean }[]): boolean {
  return sources.some((s) => s.stale);
}

export function WorldStatusBar({ status }: Props) {
  return (
    <div className="flex border border-eve-panel-border/30 bg-gradient-to-br from-[#0a1628] to-[#111d2e]">
      <StatusCell
        label="Pilots"
        value={status.players.registered}
        sub={`+${status.players.active} active`}
        color="text-green-500"
        stale={isAnyStale(status.players.sources)}
      />
      <StatusCell
        label="Kills 24h"
        value={status.combat.kills24h}
        sub={`${status.combat.activeSystems} systems`}
        color="text-amber-500"
        stale={isAnyStale(status.combat.sources)}
      />
      <StatusCell
        label="Assemblies"
        value={`${status.infrastructure.onlineAssemblies} / ${status.infrastructure.totalAssemblies}`}
        sub={`infra ${status.infrastructure.infraIndex.toFixed(1)}`}
        color="text-blue-500"
        stale={isAnyStale(status.infrastructure.sources)}
      />
      <StatusCell
        label="Defense"
        value={status.defense.defenseIndex.toFixed(1)}
        color="text-purple-400"
        stale={isAnyStale(status.defense.sources)}
      />
      <StatusCell
        label="Factions"
        value={status.factions.count}
        sub={status.factions.largest.ticker || undefined}
        color="text-amber-400"
        stale={isAnyStale(status.factions.sources)}
      />
    </div>
  );
}
