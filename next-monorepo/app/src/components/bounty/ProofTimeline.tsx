"use client";

import type { BountyEvent, ProofDetail, RejectDetail, DisputeDetail, ResolveDetail } from "@/types";
import { CountdownTimer } from "./CountdownTimer";
import { CharacterName } from "@/components/CharacterName";

interface ProofTimelineProps {
  events: BountyEvent[];
  reviewDeadline: number | null;
}

const EVENT_LABELS: Record<string, string> = {
  proof_submitted: "Proof Submitted",
  proof_rejected: "Proof Rejected",
  proof_resubmitted: "Proof Resubmitted",
  dispute_raised: "Dispute Raised",
  dispute_resolved: "Dispute Resolved",
  proof_auto_approved: "Auto-Approved",
};

const EVENT_COLORS: Record<string, string> = {
  proof_submitted: "border-eve-cyan/40",
  proof_rejected: "border-red-500/40",
  proof_resubmitted: "border-eve-cyan/40",
  dispute_raised: "border-amber-400/40",
  dispute_resolved: "border-eve-cold/40",
  proof_auto_approved: "border-green-500/40",
};

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ProofTimeline({ events, reviewDeadline }: ProofTimelineProps) {
  if (events.length === 0) return null;

  const lastEvent = events[events.length - 1]!;
  const showCountdown = reviewDeadline &&
    (lastEvent.eventType === "proof_submitted" || lastEvent.eventType === "proof_resubmitted");

  return (
    <div className="mt-2">
      <p className="text-[0.66rem] text-eve-muted mb-2 uppercase tracking-wide">Proof Timeline</p>
      <div className="border-l-2 border-eve-panel-border pl-3 grid gap-2">
        {events.map((ev) => (
          <div
            key={ev.id}
            className={`border ${EVENT_COLORS[ev.eventType] ?? "border-eve-panel-border/40"} bg-[rgba(8,11,16,0.84)] p-2`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.66rem] font-mono uppercase tracking-wide text-eve-cold">
                {EVENT_LABELS[ev.eventType] ?? ev.eventType}
              </span>
              <span className="text-[0.6rem] text-eve-muted">{formatTs(ev.timestamp)}</span>
            </div>
            <p className="text-[0.66rem] text-eve-muted mt-0.5">
              Hunter: <CharacterName address={ev.hunter} className="text-[0.66rem]" />
              {ev.actor && (
                <> | Actor: <CharacterName address={ev.actor} className="text-[0.66rem]" /></>
              )}
            </p>
            {renderDetail(ev)}
            <a
              href={`https://suiscan.xyz/testnet/tx/${ev.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.6rem] text-eve-muted/60 hover:text-eve-cyan mt-0.5 inline-block"
            >
              tx: {ev.txDigest.slice(0, 12)}...
            </a>
          </div>
        ))}
        {showCountdown && (
          <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2">
            <CountdownTimer targetMs={reviewDeadline} label="Auto-approve in" />
          </div>
        )}
      </div>
    </div>
  );
}

function renderDetail(ev: BountyEvent) {
  if (!ev.detail) return null;

  switch (ev.eventType) {
    case "proof_submitted":
    case "proof_resubmitted": {
      const d = ev.detail as ProofDetail;
      return (
        <a
          href={d.proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-eve-cyan hover:underline mt-0.5 block truncate"
        >
          {d.proofUrl}
        </a>
      );
    }
    case "proof_rejected": {
      const d = ev.detail as RejectDetail;
      return <p className="text-xs text-red-400 mt-0.5">{d.reason}</p>;
    }
    case "dispute_raised": {
      const d = ev.detail as DisputeDetail;
      return <p className="text-xs text-amber-400 mt-0.5">{d.reason}</p>;
    }
    case "dispute_resolved": {
      const d = ev.detail as ResolveDetail;
      return (
        <p className={`text-xs mt-0.5 ${d.approved ? "text-green-400" : "text-red-400"}`}>
          Verdict: {d.approved ? "Approved" : "Rejected"}
        </p>
      );
    }
    default:
      return null;
  }
}
