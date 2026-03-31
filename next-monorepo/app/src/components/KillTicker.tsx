"use client";

import { Panel } from "@/components/ui/Panel";
import type { KillEvent } from "@/types";

interface Props {
  kills: KillEvent[];
}

export function KillTicker({ kills }: Props) {
  if (kills.length === 0) {
    return (
      <Panel title="Kill Ticker" badge="LIVE">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60">No recent kills</p>
      </Panel>
    );
  }

  return (
    <Panel title="Kill Ticker" badge="LIVE">
      <div className="mt-2 grid gap-1.5">
        {kills.map((kill) => (
          <div
            key={`${kill.source}-${kill.id}`}
            className="flex items-center justify-between border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-1.5 transition-colors"
          >
            <div className="text-[0.7rem]">
              <span className="text-red-400">{kill.killerName}</span>
              <span className="text-eve-muted/50 mx-1">&rarr;</span>
              <span className="text-eve-muted">{kill.victimName}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-[0.6rem] text-eve-muted/50 border border-eve-panel-border/30 px-1 py-0.5">
                {kill.lossType}
              </span>
              <span className="text-[0.6rem] text-eve-muted/50 border border-eve-panel-border/30 px-1 py-0.5">
                SYS-{kill.solarSystemId}
              </span>
              <span
                className={`text-[0.55rem] border px-1 py-0.5 ${
                  kill.source === "eve-eyes"
                    ? "border-blue-500/40 text-blue-400"
                    : "border-amber-500/40 text-amber-400"
                }`}
              >
                {kill.source === "eve-eyes" ? "EVE" : "UTP"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
