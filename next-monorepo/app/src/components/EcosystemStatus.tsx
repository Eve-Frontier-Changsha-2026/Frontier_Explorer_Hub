"use client";

import { Panel } from "@/components/ui/Panel";
import type { EcosystemFeature } from "@/types";

interface Props {
  features: EcosystemFeature[] | null;
  isLoading?: boolean;
}

export function EcosystemStatus({ features, isLoading }: Props) {
  if (isLoading || features === null) {
    return (
      <Panel title="EVE Frontier Ecosystem" badge="STATUS">
        <p className="mt-2 text-[0.73rem] text-eve-muted/60 animate-pulse-dot">Loading...</p>
      </Panel>
    );
  }

  return (
    <Panel title="EVE Frontier Ecosystem" badge="STATUS">
      <div className="mt-2 grid grid-cols-2 gap-1.5 max-sm:grid-cols-1">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.84)] p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-eve-cold">{feature.title}</span>
              <span
                className={`text-[0.58rem] border px-1 py-0.5 ${
                  feature.status === "live"
                    ? "border-green-500/40 text-green-400"
                    : "border-eve-panel-border text-eve-muted/50"
                }`}
              >
                {feature.status === "live" ? "LIVE" : "LOCKED"}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium">{feature.metric}</p>
            <p className="mt-0.5 text-[0.65rem] text-eve-muted/60 line-clamp-1">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
