"use client";

import { useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { MetricChip } from "@/components/ui/MetricChip";
import { useSubscription } from "@/hooks/use-subscription";

const COVERAGE_ZONES = [
  { id: "Z-A1", name: "Citadel Arc", free: "Delayed", premium: "Live" },
  { id: "Z-B4", name: "Refinery Spine", free: "Locked Depth", premium: "Deep Zoom" },
  { id: "Z-C8", name: "Outer Colony", free: "Basic Intel", premium: "Full Breakdown" },
  { id: "Z-D2", name: "Ancient Relay", free: "No Forecast", premium: "Predictive Alerts" },
];

const CAPABILITY_ROWS = [
  { cap: "Heatmap Refresh", free: "60s", premium: "10s" },
  { cap: "Map Zoom Depth", free: "Level 1", premium: "Level 2" },
  { cap: "Intel Breakdown", free: "Basic", premium: "Full" },
  { cap: "Bounty Signal Priority", free: "Standard Queue", premium: "Priority Queue" },
  { cap: "Route Forecast", free: "-", premium: "Enabled" },
];

export default function SubscribePage() {
  const account = useCurrentAccount();
  const { subscription, isPremium, isLoading, subscribe, isSubscribing } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "quarterly">("monthly");
  const [activeZone, setActiveZone] = useState(COVERAGE_ZONES[0].id);

  const expiresText = useMemo(() => {
    if (!subscription?.expiresAt) return "N/A";
    return new Date(subscription.expiresAt).toLocaleString();
  }, [subscription]);

  const statusLabel = useMemo(() => {
    if (isPremium) return "Active (Premium)";
    if (!subscription) return "Active (Basic)";
    if (!subscription.isActive) return "Expired";
    return "Standard";
  }, [isPremium, subscription]);

  const zone = COVERAGE_ZONES.find((z) => z.id === activeZone) ?? COVERAGE_ZONES[0];

  const onUpgrade = async () => {
    if (!account) return;
    const days = billingCycle === "monthly" ? 30 : 90;
    const priceMist = billingCycle === "monthly" ? 30_000_000_000 : 81_000_000_000;
    await subscribe({ days, priceMist });
  };

  return (
    <>
      <PageHeader
        title="MEMBERSHIP COMMAND"
        subtitle="Manage access tiers, coverage zones, and subscription status."
        variant="membership"
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          {/* Current Access */}
          <Panel title="Current Access Level" badge={isPremium ? "PREMIUM ACTIVE" : "FREE ACCESS"}>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MetricChip label="Tier" value={isPremium ? "Premium" : "Free"} />
              <MetricChip label="Status" value={statusLabel} />
              <MetricChip label="Expiry" value={expiresText} />
            </div>
            {isLoading && <p className="mt-2 text-[0.73rem] text-eve-muted/80">Syncing membership status...</p>}
          </Panel>

          {/* Coverage Zones */}
          <Panel title="Coverage Advantage Map" badge={zone.id}>
            <div className="mt-2 grid grid-cols-4 gap-2 max-lg:grid-cols-2">
              {COVERAGE_ZONES.map((z) => (
                <button
                  key={z.id}
                  className={`border text-left p-2 cursor-pointer ${
                    activeZone === z.id
                      ? "border-eve-gold/60 bg-[rgba(21,16,14,0.84)]"
                      : "border-eve-panel-border bg-[rgba(10,14,20,0.88)] hover:border-eve-panel-border"
                  }`}
                  onClick={() => setActiveZone(z.id)}
                >
                  <strong className="block text-xs text-eve-cold">{z.id}</strong>
                  <span className="text-[0.64rem] text-eve-muted">{z.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 border border-eve-panel-border/50 bg-[rgba(8,11,16,0.84)] p-2">
              <div className="flex items-center justify-between">
                <strong className="text-xs">{zone.name}</strong>
                <span className="text-[0.66rem] text-eve-muted">Feature Delta</span>
              </div>
              <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                Free: {zone.free} | Premium: {zone.premium}
              </p>
            </div>
          </Panel>

          {/* Plans */}
          <Panel title="Plan Selection" badge="2 tiers">
            <div className="mt-2 flex gap-2">
              {(["monthly", "quarterly"] as const).map((cycle) => (
                <button
                  key={cycle}
                  className={`border px-3 py-2 text-xs uppercase tracking-wide cursor-pointer ${
                    billingCycle === cycle
                      ? "border-eve-gold/60 text-eve-gold"
                      : "border-eve-panel-border text-eve-muted hover:text-eve-text"
                  }`}
                  onClick={() => setBillingCycle(cycle)}
                >
                  {cycle} Billing
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {/* Free Plan */}
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-3">
                <div className="flex justify-between items-center">
                  <strong className="text-sm">Free</strong>
                  <span className="text-xs text-eve-muted">0 SUI</span>
                </div>
                <ul className="mt-2 text-[0.73rem] text-eve-muted/80 list-disc pl-4 space-y-1">
                  <li>Zoom Level 0-1</li>
                  <li>Delayed intel refresh</li>
                </ul>
                <button className="mt-3 w-full border border-eve-panel-border text-eve-muted text-xs py-2 uppercase cursor-default">
                  Current Base Tier
                </button>
              </div>
              {/* Premium Plan */}
              <div className="border border-eve-gold/60 bg-gradient-to-b from-[rgba(28,21,16,0.9)] to-[rgba(13,11,10,0.9)] p-3 animate-glow-pulse">
                <div className="flex justify-between items-center">
                  <strong className="text-sm">Premium</strong>
                  <span className="text-xs text-eve-gold">
                    {billingCycle === "quarterly" ? "81 SUI / 90d" : "30 SUI / 30d"}
                  </span>
                </div>
                <ul className="mt-2 text-[0.73rem] text-eve-muted/80 list-disc pl-4 space-y-1">
                  <li>Zoom Level 0-2</li>
                  <li>10s live refresh</li>
                </ul>
                <button
                  className="mt-3 w-full border border-eve-gold/90 text-[#fff5e8] text-xs py-2 uppercase cursor-pointer bg-gradient-to-b from-[rgba(165,109,57,0.72)] to-[rgba(77,48,23,0.72)] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onUpgrade}
                  disabled={!account || isSubscribing}
                >
                  {isSubscribing ? "Processing..." : "Upgrade Membership"}
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start sticky top-4">
          <Panel title="Billing Summary" badge="Ledger">
            <div className="mt-2 grid gap-2">
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <div className="flex justify-between">
                  <strong className="text-xs">Current Cycle</strong>
                  <span className="text-[0.66rem] text-eve-muted">{billingCycle}</span>
                </div>
                <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                  {isPremium ? "Premium charges renew unless canceled." : "No active paid membership."}
                </p>
              </div>
              <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                <div className="flex justify-between">
                  <strong className="text-xs">Wallet Access</strong>
                  <span className="text-[0.66rem] text-eve-muted">{subscription?.nftId ? "Bound" : "Unbound"}</span>
                </div>
                <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                  {subscription?.nftId ? `NFT: ${subscription.nftId.slice(0, 12)}...` : "Bind wallet after first premium activation."}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Capability Matrix */}
      <Panel title="Capability Matrix" badge="Comparison" className="mt-3">
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-eve-panel-border/50 px-2 py-2 text-left text-eve-info bg-[rgba(18,23,32,0.84)]">Capability</th>
                <th className="border border-eve-panel-border/50 px-2 py-2 text-left text-eve-info bg-[rgba(18,23,32,0.84)]">Free</th>
                <th className="border border-eve-panel-border/50 px-2 py-2 text-left text-eve-info bg-[rgba(18,23,32,0.84)]">Premium</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_ROWS.map((row) => (
                <tr key={row.cap}>
                  <td className="border border-eve-panel-border/50 px-2 py-2 text-eve-muted/80">{row.cap}</td>
                  <td className="border border-eve-panel-border/50 px-2 py-2 text-eve-muted/80">{row.free}</td>
                  <td className="border border-eve-panel-border/50 px-2 py-2 text-eve-muted/80">{row.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
