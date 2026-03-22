"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useBounties } from "@/hooks/use-bounties";
import { INTEL_TYPE_LABELS } from "@/lib/constants";

const DEADLINE_OPTIONS = [
  { label: "24h", ms: 86_400_000 },
  { label: "48h", ms: 172_800_000 },
  { label: "72h", ms: 259_200_000 },
  { label: "7d", ms: 604_800_000 },
];

export default function BountiesPage() {
  const account = useCurrentAccount();
  const { bounties, isLoading, createBounty, isCreating } = useBounties();

  const [regionId, setRegionId] = useState(0);
  const [sectorX, setSectorX] = useState(0);
  const [sectorY, setSectorY] = useState(0);
  const [sectorZ, setSectorZ] = useState(0);
  const [intelTypes, setIntelTypes] = useState<number[]>([1]);
  const [rewardSui, setRewardSui] = useState(1);
  const [deadlineMs, setDeadlineMs] = useState(DEADLINE_OPTIONS[2].ms);

  const onCreate = async () => {
    if (!account) return;
    await createBounty({
      targetRegion: { regionId, sectorX, sectorY, sectorZ, zoomLevel: 0 },
      intelTypesWanted: intelTypes,
      rewardMist: rewardSui * 1_000_000_000,
      deadlineMs: Date.now() + deadlineMs,
    });
  };

  const toggleIntelType = (type: number) => {
    setIntelTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <>
      <PageHeader
        title="BOUNTY COMMAND BOARD"
        subtitle="Create and track active operational bounties with payout-focused structure."
        metrics={[
          { label: "Active", value: String(bounties.length) },
          { label: "Status", value: isLoading ? "Loading" : "Ready" },
          { label: "Wallet", value: account ? "Connected" : "---" },
        ]}
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          <Panel title="Create Bounty" badge={account ? "Ready" : "Connect Wallet"}>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { label: "Region ID", value: regionId, set: setRegionId },
                { label: "Sector X", value: sectorX, set: setSectorX },
                { label: "Sector Y", value: sectorY, set: setSectorY },
                { label: "Sector Z", value: sectorZ, set: setSectorZ },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <p className="text-[0.66rem] text-eve-muted mb-1">{label}</p>
                  <input
                    className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                    type="number"
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                  />
                </div>
              ))}
            </div>

            <div className="mt-3">
              <p className="text-[0.66rem] text-eve-muted mb-1">Intel Types Wanted</p>
              <div className="flex gap-2">
                {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => {
                  const type = Number(k);
                  const active = intelTypes.includes(type);
                  return (
                    <button
                      key={k}
                      className={`border px-2 py-1.5 text-xs uppercase tracking-wide cursor-pointer ${
                        active
                          ? "border-eve-gold/60 text-eve-gold"
                          : "border-eve-panel-border text-eve-muted hover:text-eve-text"
                      }`}
                      onClick={() => toggleIntelType(type)}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Reward (SUI)</p>
                <input
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={rewardSui}
                  onChange={(e) => setRewardSui(Number(e.target.value))}
                />
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Deadline</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={deadlineMs}
                  onChange={(e) => setDeadlineMs(Number(e.target.value))}
                >
                  {DEADLINE_OPTIONS.map((opt) => (
                    <option key={opt.ms} value={opt.ms}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-4 py-2.5 uppercase tracking-wide cursor-pointer hover:border-eve-cold/50 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onCreate}
                disabled={!account || isCreating}
              >
                {isCreating ? "Creating..." : "Create Bounty"}
              </button>
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          <Panel title="Active Bounties" badge={isLoading ? "loading" : String(bounties.length)}>
            {isLoading && <p className="mt-2 text-[0.73rem] text-eve-muted/80">Loading bounties...</p>}
            <div className="mt-2 grid gap-2 max-h-[500px] overflow-y-auto">
              {!isLoading && bounties.length === 0 && (
                <p className="text-[0.73rem] text-eve-muted/80">No active on-chain bounties.</p>
              )}
              {bounties.map((bounty, i) => (
                <div
                  key={bounty.id}
                  className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2 animate-slide-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs truncate">{bounty.id.slice(0, 16)}...</strong>
                    <RiskBadge severity={bounty.rewardAmount > 5_000_000_000 ? 8 : 4} />
                  </div>
                  <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                    Reward: {(bounty.rewardAmount / 1_000_000_000).toFixed(2)} SUI
                  </p>
                  <p className="text-[0.63rem] text-eve-muted">
                    Types: {bounty.intelTypesWanted.map((t) => INTEL_TYPE_LABELS[t] ?? t).join(", ")}
                  </p>
                  <p className="text-[0.63rem] text-eve-muted">
                    Submissions: {bounty.submissionCount} | Status: {bounty.status}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
