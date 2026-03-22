"use client";

import { useState, useMemo } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { useSubmitIntel } from "@/hooks/use-intel";
import { useUIStore } from "@/stores/ui-store";
import { INTEL_TYPE_LABELS, MIN_SUBMIT_DEPOSIT_MIST } from "@/lib/constants";

const EXPIRY_OPTIONS = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "6 hours", ms: 21_600_000 },
  { label: "24 hours", ms: 86_400_000 },
  { label: "7 days", ms: 604_800_000 },
];

export default function SubmitPage() {
  const account = useCurrentAccount();
  const submitIntel = useSubmitIntel();
  const pendingTx = useUIStore((s) => s.pendingTx);

  const [regionId, setRegionId] = useState(0);
  const [sectorX, setSectorX] = useState(0);
  const [sectorY, setSectorY] = useState(0);
  const [sectorZ, setSectorZ] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [intelType, setIntelType] = useState(0);
  const [severity, setSeverity] = useState(5);
  const [expiryMs, setExpiryMs] = useState(EXPIRY_OPTIONS[2].ms);
  const [visibility, setVisibility] = useState(0);
  const [depositMist, setDepositMist] = useState(MIN_SUBMIT_DEPOSIT_MIST);
  const [txHistory, setTxHistory] = useState<{ digest: string; ts: number }[]>([]);

  const rawLocationHash = useMemo(() => {
    const data = `${regionId}:${sectorX}:${sectorY}:${sectorZ}:${zoomLevel}`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    const hash: number[] = [];
    for (let i = 0; i < 32; i++) {
      hash.push(bytes[i % bytes.length] ^ (i * 31));
    }
    return hash;
  }, [regionId, sectorX, sectorY, sectorZ, zoomLevel]);

  const onSubmit = async () => {
    if (!account) return;
    try {
      const result = await submitIntel.mutateAsync({
        location: { regionId, sectorX, sectorY, sectorZ, zoomLevel },
        rawLocationHash,
        intelType,
        severity,
        expiryMs: Date.now() + expiryMs,
        visibility,
        depositMist,
      });
      setTxHistory((prev) => [{ digest: result.digest, ts: Date.now() }, ...prev]);
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <>
      <PageHeader
        title="INTEL SUBMISSION DESK"
        subtitle="Submit on-chain intel reports with deposit stake and expiry configuration."
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          <Panel title="New Report" badge={account ? "Ready" : "Connect Wallet"}>
            {/* Location */}
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[
                { label: "Region ID", value: regionId, set: setRegionId },
                { label: "Sector X", value: sectorX, set: setSectorX },
                { label: "Sector Y", value: sectorY, set: setSectorY },
                { label: "Sector Z", value: sectorZ, set: setSectorZ },
                { label: "Zoom", value: zoomLevel, set: setZoomLevel },
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

            {/* Intel Type + Severity */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Intel Type</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={intelType}
                  onChange={(e) => setIntelType(Number(e.target.value))}
                >
                  {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Severity (0-10)</p>
                <input
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  type="range"
                  min={0}
                  max={10}
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                />
                <span className="text-xs text-eve-muted">{severity}</span>
              </div>
            </div>

            {/* Expiry + Visibility + Deposit */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Expiry</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={expiryMs}
                  onChange={(e) => setExpiryMs(Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.ms} value={opt.ms}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Visibility</p>
                <select
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  value={visibility}
                  onChange={(e) => setVisibility(Number(e.target.value))}
                >
                  <option value={0}>Public</option>
                  <option value={1}>Subscribers Only</option>
                </select>
              </div>
              <div>
                <p className="text-[0.66rem] text-eve-muted mb-1">Deposit (MIST)</p>
                <input
                  className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2"
                  type="number"
                  min={MIN_SUBMIT_DEPOSIT_MIST}
                  value={depositMist}
                  onChange={(e) => setDepositMist(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-4 py-2.5 uppercase tracking-wide cursor-pointer hover:border-eve-cold/50 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onSubmit}
                disabled={!account || submitIntel.isPending}
              >
                {submitIntel.isPending ? "Submitting..." : "Submit Intel"}
              </button>
            </div>
            {pendingTx && (
              <p className="mt-2 text-xs text-eve-cold animate-pulse-dot">
                Pending: {pendingTx.slice(0, 16)}...
              </p>
            )}
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          <Panel title="Transaction History" badge={String(txHistory.length)}>
            <div className="mt-2 grid gap-2 max-h-80 overflow-y-auto">
              {txHistory.length === 0 && <p className="text-[0.73rem] text-eve-muted/80">No submissions yet.</p>}
              {txHistory.map((tx) => (
                <div key={tx.digest} className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
                  <strong className="text-xs text-eve-cold break-all">{tx.digest}</strong>
                  <p className="text-[0.63rem] text-eve-muted mt-1">
                    {new Date(tx.ts).toLocaleTimeString()}
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
