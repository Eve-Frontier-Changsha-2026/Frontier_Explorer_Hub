"use client";

import { useMemo, useState } from "react";
import { useIntelRequests } from "@/hooks/use-intel-market";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { CountdownTimer } from "./CountdownTimer";
import type { IntelRequestV2 } from "@/types";

const TYPE_COLORS: Record<number, string> = {
  0: "text-eve-safe",
  1: "text-eve-danger",
  2: "text-eve-warn",
  3: "text-eve-info",
};

const SORT_OPTIONS = [
  { label: "Reward ↓", key: "reward_desc" },
  { label: "Newest", key: "newest" },
  { label: "Deadline", key: "deadline" },
] as const;

export function IntelRequestBrowser({
  onFulfill,
  selectedRequestId,
  onSelectRequest,
}: {
  onFulfill?: (requestId: string) => void;
  selectedRequestId?: string | null;
  onSelectRequest?: (id: string | null) => void;
}) {
  const { data: requests, isLoading } = useIntelRequests();
  const account = useCurrentAccount();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("reward_desc");

  const filtered = useMemo(() => {
    if (!requests) return [];
    let result = requests.filter((r) => r.status === 0 || r.status === 1); // OPEN + REVIEWING
    if (typeFilter !== null) result = result.filter((r) => r.intelType === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          String(r.regionId).includes(q)
      );
    }
    if (sort === "reward_desc") result.sort((a, b) => b.rewardMist - a.rewardMist);
    else if (sort === "newest") result.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "deadline") result.sort((a, b) => a.deadline - b.deadline);
    return result;
  }, [requests, typeFilter, search, sort]);

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">Active Requests</div>

      <input
        type="text"
        placeholder="🔍 Search by title, region, keyword..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5 mb-2"
      />

      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-[0.6rem] border px-1.5 py-0.5 ${
              typeFilter === null ? "border-eve-gold/40 text-eve-gold bg-eve-gold/5" : "border-eve-panel-border text-eve-muted"
            }`}
          >All</button>
          {Object.entries(INTEL_TYPE_LABELS).map(([k, label]) => (
            <button key={k} onClick={() => setTypeFilter(Number(k))}
              className={`text-[0.6rem] border px-1.5 py-0.5 ${typeFilter === Number(k) ? "border-eve-gold/40 bg-eve-gold/5" : "border-eve-panel-border"} ${TYPE_COLORS[Number(k)]}`}
            >{label}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="text-[0.6rem] bg-transparent border border-eve-panel-border text-eve-muted px-1 py-0.5"
        >
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {isLoading && <div className="text-xs text-eve-muted p-4">Loading...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-xs text-eve-muted p-4 text-center">
            No open requests. Post one to get started.
          </div>
        )}
        {filtered.map((req) => {
          const isMine = account?.address === req.buyer;
          const isSelected = selectedRequestId === req.id;
          return (
            <RequestCard
              key={req.id}
              request={req}
              isMine={isMine}
              isSelected={isSelected}
              onFulfill={!isMine ? () => {
                if (onSelectRequest) onSelectRequest(isSelected ? null : req.id);
                if (onFulfill) onFulfill(req.id);
              } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function RequestCard({
  request: r,
  isMine,
  isSelected,
  onFulfill,
}: {
  request: IntelRequestV2;
  isMine: boolean;
  isSelected?: boolean;
  onFulfill?: () => void;
}) {
  const typeColor = TYPE_COLORS[r.intelType] ?? "text-eve-muted";
  const isExpired = r.deadline > 0 && Date.now() > r.deadline;

  return (
    <div
      className={`border p-2 cursor-pointer transition-colors ${
        isSelected
          ? "border-eve-gold/60 bg-[rgba(16,20,28,0.9)]"
          : "border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] hover:border-eve-panel-border/60"
      }`}
      onClick={onFulfill}
    >
      <div className="flex justify-between items-center">
        <span className={`${typeColor} text-[0.63rem]`}>
          {INTEL_TYPE_LABELS[r.intelType] ?? "Unknown"}
        </span>
        <span className="text-eve-gold text-[0.63rem] font-bold">
          {(r.rewardMist / 1_000_000_000).toFixed(2)} SUI
        </span>
      </div>
      <div className="text-[0.7rem] text-eve-text mt-1 truncate">{r.title}</div>
      <div className="text-[0.6rem] text-eve-muted mt-0.5 line-clamp-2">{r.description}</div>
      <div className="text-[0.6rem] text-eve-muted mt-0.5">Region {r.regionId}</div>
      <div className="flex justify-between items-center mt-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[0.55rem] text-eve-muted">
            {r.submissionCount} submission{r.submissionCount !== 1 ? "s" : ""}
          </span>
          <CountdownTimer targetMs={r.deadline} />
        </div>
        <div className="flex gap-1">
          {isExpired && (
            <span className="text-[0.6rem] text-eve-danger">EXPIRED</span>
          )}
          {r.status === 1 && (
            <span className="text-[0.6rem] text-eve-warn">REVIEWING</span>
          )}
          {!isMine && !isExpired && r.status === 0 && (
            <span className={`text-[0.6rem] ${isSelected ? "text-eve-gold" : "text-eve-muted"}`}>
              {isSelected ? "▸ SELECTED" : "Click to fulfill"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
