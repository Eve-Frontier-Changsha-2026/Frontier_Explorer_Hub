"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { usePostRequest } from "@/hooks/use-intel-market";
import { INTEL_TYPE_LABELS, DEADLINE_OPTIONS } from "@/lib/constants";

export function PostRequestForm() {
  const account = useCurrentAccount();
  const postRequest = usePostRequest();

  const [title, setTitle] = useState("");
  const [intelType, setIntelType] = useState(0);
  const [regionId, setRegionId] = useState(0);
  const [description, setDescription] = useState("");
  const [rewardSui, setRewardSui] = useState("");
  const [deadlineOffset, setDeadlineOffset] = useState(DEADLINE_OPTIONS[2].ms);

  const handleSubmit = async () => {
    if (!account) return;
    const rewardMist = Math.floor(parseFloat(rewardSui) * 1_000_000_000);
    await postRequest.mutateAsync({
      title,
      intelType,
      regionId,
      description,
      rewardMist,
      deadlineMs: Date.now() + deadlineOffset,
    });
    // Reset form
    setTitle("");
    setDescription("");
    setRewardSui("");
  };

  const inputClass = "w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5";

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel sticky top-4">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">Post New Request</div>

      <input type="text" placeholder='Title: "Need threat intel for..."' value={title}
        onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mb-1.5`} maxLength={256} />

      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <select value={intelType} onChange={(e) => setIntelType(Number(e.target.value))} className={inputClass}>
          {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="number" placeholder="Region ID" value={regionId || ""} onChange={(e) => setRegionId(Number(e.target.value))} className={inputClass} />
      </div>

      <textarea placeholder="Description: what intel you need..."
        value={description} onChange={(e) => setDescription(e.target.value)}
        className={`${inputClass} mb-1.5 min-h-[60px] resize-none`} maxLength={1024} />

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <input type="number" placeholder="Reward (SUI)" step="0.01" value={rewardSui}
          onChange={(e) => setRewardSui(e.target.value)} className={`${inputClass} text-eve-safe`} />
        <select value={deadlineOffset} onChange={(e) => setDeadlineOffset(Number(e.target.value))} className={inputClass}>
          {DEADLINE_OPTIONS.map((o) => <option key={o.ms} value={o.ms}>{o.label}</option>)}
        </select>
      </div>

      <button onClick={handleSubmit}
        disabled={!account || postRequest.isPending || !title || !rewardSui}
        className="w-full border border-eve-cold/40 text-eve-cold py-1.5 text-xs hover:bg-eve-cold/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {postRequest.isPending ? "Posting..." : "📡 POST REQUEST (LOCK REWARD)"}
      </button>

      <div className="border-t border-eve-panel-border/20 mt-3 pt-2">
        <div className="text-[0.6rem] text-eve-muted/50 leading-relaxed">
          ▸ Click a request to view submissions<br />
          ▸ First submission starts 24h countdown<br />
          ▸ Pick best → confirm & rate → auto-release
        </div>
      </div>
    </div>
  );
}
