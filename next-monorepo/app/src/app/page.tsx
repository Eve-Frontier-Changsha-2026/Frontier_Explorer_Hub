"use client";

import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { WorldStatusBar } from "@/components/WorldStatusBar";
import { KillTicker } from "@/components/KillTicker";
import { useDashboard } from "@/hooks/use-dashboard";
import { useWorldStatus } from "@/hooks/use-world-status";
import type { KillEntry } from "@/types";

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

function killToRisk(kill: KillEntry): RiskLevel {
  const age = Date.now() - kill.killedAt;
  if (age < 3600000) return "CRITICAL";
  if (age < 21600000) return "HIGH";
  if (age < 86400000) return "MEDIUM";
  return "LOW";
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 16);
}

function formatAge(ts: number): string {
  const hours = Math.floor((Date.now() - ts) / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function HomePage() {
  const { feedItems, stats, regionSummary, isLoading } = useDashboard();
  const { worldStatus, isLoading: worldLoading } = useWorldStatus();

  const recentKills = worldStatus?.combat.recentKills ?? [];
  const breaking = recentKills[0];

  const headlines = recentKills.map((kill, i) => ({
    id: `KILL-${i}`,
    title: `${kill.killerName} destroyed ${kill.victimName}'s ${kill.lossType.toLowerCase()}`,
    summary: `Kill reported in system ${kill.solarSystemId}`,
    risk: killToRisk(kill) as RiskLevel,
    category: "Combat",
    ts: formatTime(kill.killedAt) + " UTC",
  }));

  const timelineEvents = recentKills.map((kill, i) => ({
    id: `EV-${i}`,
    title: `${kill.killerName} → ${kill.victimName}`,
    age: formatAge(kill.killedAt),
    detail: `${kill.lossType} lost in system ${kill.solarSystemId}`,
  }));

  const briefing = worldStatus
    ? `${worldStatus.combat.kills24h} kills across ${worldStatus.combat.activeSystems} systems in the last 24 hours. ${worldStatus.infrastructure.onlineAssemblies} assemblies online out of ${worldStatus.infrastructure.totalAssemblies}. ${worldStatus.players.newLast24h} new pilots registered. Defense index at ${worldStatus.defense.defenseIndex.toFixed(1)}, traffic index at ${worldStatus.traffic.trafficIndex.toFixed(1)}. Largest faction: ${worldStatus.factions.largest.name} (${worldStatus.factions.largest.members} members).`
    : "Loading frontier intel...";

  return (
    <>
      <PageHeader
        title="REAL-TIME FRONTIER INTEL DASHBOARD"
        subtitle="Operational monitor for conflict routes, signal anomalies, population drift, and bounty response."
        metrics={[
          { label: "Reports", value: String(stats.totalReports) },
          { label: "Active Alerts", value: String(stats.alertCount) },
          { label: "Active Regions", value: String(stats.activeRegions) },
        ]}
      />

      {worldStatus && <div className="mt-3"><WorldStatusBar status={worldStatus} /></div>}
      {worldLoading && (
        <div className="mt-3 h-16 border border-eve-panel-border/30 bg-gradient-to-br from-[#0a1628] to-[#111d2e] animate-pulse" />
      )}

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          <Panel title="Breaking" badge={breaking ? killToRisk(breaking) : "—"}>
            {breaking ? (
              <>
                <h2 className="mt-2 text-base leading-snug">
                  {breaking.killerName} destroyed {breaking.victimName}&apos;s {breaking.lossType.toLowerCase()}
                </h2>
                <p className="mt-2 text-[0.74rem] text-eve-muted/80 leading-relaxed">
                  Kill confirmed in system {breaking.solarSystemId}. View on{" "}
                  <a
                    href={`https://suiscan.xyz/testnet/object/${breaking.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    SUI Explorer
                  </a>
                </p>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">
                    {formatTime(breaking.killedAt)} UTC
                  </span>
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">
                    SYS-{breaking.solarSystemId}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[0.74rem] text-eve-muted/60">No recent combat events</p>
            )}
          </Panel>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 max-lg:grid-cols-1">
            <Panel title="Daily Briefing" badge="AI Summary">
              <p className="mt-2 text-[0.73rem] text-eve-muted/80 leading-relaxed">{briefing}</p>
            </Panel>

            <Panel title="Headlines" badge={`${headlines.length} entries`}>
              <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
                {headlines.length === 0 && (
                  <p className="text-[0.73rem] text-eve-muted/60">No recent events</p>
                )}
                {headlines.map((item) => (
                  <div key={item.id} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs">{item.title}</strong>
                      <RiskBadge risk={item.risk} />
                    </div>
                    <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.id}</span>
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.category}</span>
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.ts}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Events Timeline" badge="Top Recent">
            <div className="mt-2 grid gap-2">
              {timelineEvents.length === 0 && (
                <p className="text-[0.73rem] text-eve-muted/60">No recent events</p>
              )}
              {timelineEvents.map((event) => (
                <div key={event.id} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{event.title}</strong>
                    <span className="text-[0.66rem] text-eve-muted">{event.age}</span>
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">{event.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          <Panel title="Conflict Map" badge="ef-map">
            <div className="mt-2 border border-eve-panel-border bg-[rgba(4,7,11,0.9)] p-1">
              <iframe
                className="w-full min-h-[300px] border-0 block"
                src="https://ef-map.com/embed?embed=1"
                title="EVE Frontier map"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </Panel>

          <Panel title="Live Intel Feed" badge={`${feedItems.length} records`}>
            {isLoading && <p className="mt-2 text-[0.73rem] text-eve-muted/80">Loading feed...</p>}
            <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
              {feedItems.map((item) => (
                <div key={item.id} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs">{item.id}</strong>
                    <RiskBadge risk={item.risk} />
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">{item.note}</p>
                  <div className="mt-1.5 flex gap-1.5 flex-wrap">
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">SYS-{item.system}</span>
                    <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{item.ts} UTC</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <KillTicker kills={recentKills} />

          <Panel title="Activity" badge="live">
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <strong className="block text-sm">{stats.totalReports}</strong>
                <p className="text-[0.64rem] text-eve-muted">Total Reports</p>
              </div>
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <strong className="block text-sm">{stats.alertCount}</strong>
                <p className="text-[0.64rem] text-eve-muted">Active Alerts</p>
              </div>
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <strong className="block text-sm">{worldStatus?.players.registered ?? regionSummary?.heatmap?.reporterCount ?? 0}</strong>
                <p className="text-[0.64rem] text-eve-muted">Pilots</p>
              </div>
            </div>
            {worldStatus && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <strong className="block text-sm">{worldStatus.infrastructure.onlineAssemblies}</strong>
                  <p className="text-[0.64rem] text-eve-muted">Online Assemblies</p>
                </div>
                <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <strong className="block text-sm">{worldStatus.factions.count}</strong>
                  <p className="text-[0.64rem] text-eve-muted">Factions</p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
