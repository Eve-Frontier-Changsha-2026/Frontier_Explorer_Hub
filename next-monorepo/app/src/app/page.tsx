"use client";

import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useDashboard } from "@/hooks/use-dashboard";
import { headlines, timelineEvents } from "@/lib/mock-data";

export default function HomePage() {
  const { feedItems, stats, regionSummary, isLoading } = useDashboard();
  const breaking = headlines[0];

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

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        {/* Main Column */}
        <div className="grid gap-3">
          {/* Breaking */}
          <Panel title="Breaking" badge={breaking.risk}>
            <h2 className="mt-2 text-base leading-snug">{breaking.title}</h2>
            <p className="mt-2 text-[0.74rem] text-eve-muted/80 leading-relaxed">{breaking.summary}</p>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">{breaking.id}</span>
              <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">{breaking.category}</span>
              <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1.5 py-0.5">{breaking.ts}</span>
            </div>
          </Panel>

          {/* Headlines + Briefing */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 max-lg:grid-cols-1">
            <Panel title="Daily Briefing" badge="AI Summary">
              <p className="mt-2 text-[0.73rem] text-eve-muted/80 leading-relaxed">
                Frontier pressure is concentrated on jump lanes and refinery belts. Recommended playbook: escort convoy traffic, prioritize relay diagnostics, and keep rapid-response bounty teams near reactor-live wreck zones.
              </p>
            </Panel>

            <Panel title="Headlines" badge={`${headlines.length} entries`}>
              <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
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

          {/* Timeline */}
          <Panel title="Events Timeline" badge="Top Recent">
            <div className="mt-2 grid gap-2">
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

        {/* Sidebar Column */}
        <div className="grid gap-3 content-start">
          {/* Map Embed */}
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

          {/* Live Intel Feed */}
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

          {/* Activity Stats */}
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
                <strong className="block text-sm">{regionSummary?.activeBounties ?? 0}</strong>
                <p className="text-[0.64rem] text-eve-muted">Bounties</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
