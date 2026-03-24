"use client";

import { useRegionActivity } from "@/hooks/use-region-activity";
import { Panel } from "@/components/ui/Panel";
import { MetricChip } from "@/components/ui/MetricChip";
import type { RegionActivity } from "@/types";

interface RegionActivityPanelProps {
  regionId: number | null;
  compact?: boolean;
}

function formatTimeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

function ActivityBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.61rem] text-eve-muted uppercase tracking-wide">{label}</span>
        <span className="text-[0.61rem] text-eve-cold font-mono">{pct}</span>
      </div>
      <div className="h-1.5 bg-[rgba(8,11,16,0.84)] border border-eve-panel-border/30">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CompactView({ activity, regionId }: { activity: RegionActivity | null; regionId: number }) {
  if (!activity) return null;
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <MetricChip label="Defense" value={String(activity.defenseIndex)} />
      <MetricChip label="Infra" value={String(activity.infraIndex)} />
      <MetricChip label="Traffic" value={String(activity.trafficIndex)} />
      <MetricChip label="Players" value={String(activity.activePlayers)} />
      <span className="text-[0.55rem] text-eve-muted/60 ml-auto">
        R-{regionId} | {formatTimeAgo(activity.updatedAt)}
      </span>
    </div>
  );
}

export function RegionActivityPanel({ regionId, compact = false }: RegionActivityPanelProps) {
  const { activity, heatmap, isLoading, isStale } = useRegionActivity(regionId);

  if (compact) {
    return <CompactView activity={activity} regionId={regionId ?? 0} />;
  }

  return (
    <Panel title="REGION ACTIVITY" badge={regionId != null ? `R-${regionId}` : undefined}>
      {isLoading ? (
        <p className="mt-2 text-[0.73rem] text-eve-muted/80 animate-pulse">Loading activity data...</p>
      ) : !activity ? (
        <p className="mt-2 text-[0.73rem] text-eve-muted/60">No activity data available.</p>
      ) : (
        <div className="mt-2 grid gap-2">
          <ActivityBar label="Defense" value={activity.defenseIndex} color="bg-red-500/70" />
          <ActivityBar label="Infrastructure" value={activity.infraIndex} color="bg-eve-cyan/70" />
          <ActivityBar label="Traffic" value={activity.trafficIndex} color="bg-eve-gold/70" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[0.66rem] text-eve-cold">
              {activity.activePlayers} active player{activity.activePlayers !== 1 ? "s" : ""}
            </span>
            <span className={`text-[0.55rem] ${isStale ? "text-eve-warn animate-flicker" : "text-eve-muted/60"}`}>
              {isStale ? "STALE \u2014 " : ""}{formatTimeAgo(activity.updatedAt)}
            </span>
          </div>
          {heatmap && (
            <div className="flex gap-3 text-[0.6rem] text-eve-muted/60 border-t border-eve-panel-border/20 pt-1.5 mt-0.5">
              <span>{heatmap.totalReports} reports</span>
              <span>{heatmap.reporterCount} reporters</span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
