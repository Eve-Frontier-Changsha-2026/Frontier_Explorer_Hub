"use client";

import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { RatingStars } from "./RatingStars";
import { CountdownTimer } from "./CountdownTimer";
import { AUTO_RELEASE_MS } from "@/lib/constants";
import type { IntelRequestV2 } from "@/types";

const TYPE_COLORS: Record<number, string> = {
  0: "text-eve-safe", 1: "text-eve-danger", 2: "text-eve-warn", 3: "text-eve-info",
};
const TYPE_ICONS: Record<number, string> = {
  0: "◆", 1: "⚠", 2: "▣", 3: "●",
};

interface Props {
  request: IntelRequestV2;
  buyerRating?: number;
  buyerTrades?: number;
  onFulfill?: () => void;
}

export function IntelRequestCard({ request, buyerRating, buyerTrades, onFulfill }: Props) {
  const typeColor = TYPE_COLORS[request.intelType] ?? "text-eve-muted";
  const icon = TYPE_ICONS[request.intelType] ?? "?";
  const isReviewing = request.status === 1;
  const reviewDeadline = request.firstSubmissionAt
    ? request.firstSubmissionAt + AUTO_RELEASE_MS
    : null;

  return (
    <div className={`border p-2 cursor-pointer ${
      isReviewing
        ? "border-eve-gold/30 bg-[rgba(228,180,128,0.03)]"
        : "border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)]"
    } hover:border-eve-panel-border/60`}>
      <div className="flex justify-between items-center">
        <span className={`${typeColor} text-[0.63rem]`}>
          {icon} {INTEL_TYPE_LABELS[request.intelType]}
        </span>
        <span className="text-eve-safe text-[0.7rem] font-bold">
          {(request.rewardMist / 1_000_000_000).toFixed(2)} SUI
        </span>
      </div>
      <div className="text-[0.7rem] text-eve-text mt-1 truncate">{request.title}</div>
      <div className="text-[0.6rem] text-eve-muted mt-0.5">
        Region: {request.regionId} · Posted {new Date(request.createdAt).toLocaleString()}
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <div className="flex items-center gap-2">
          {buyerRating !== undefined && (
            <span className="text-[0.6rem] text-eve-muted">Buyer: </span>
          )}
          {buyerRating !== undefined && buyerTrades !== undefined && (
            <RatingStars rating={buyerRating} trades={buyerTrades} />
          )}
          <span className={`text-[0.6rem] ${request.submissionCount > 0 ? "text-eve-warn" : "text-eve-muted/50"}`}>
            {request.submissionCount} submission{request.submissionCount !== 1 ? "s" : ""}
          </span>
          {reviewDeadline && <CountdownTimer targetMs={reviewDeadline} />}
        </div>
        {request.status === 0 && onFulfill && (
          <button
            onClick={(e) => { e.stopPropagation(); onFulfill(); }}
            className="text-[0.6rem] border border-eve-cold/40 text-eve-cold px-1.5 py-0.5 hover:bg-eve-cold/10"
          >
            FULFILL
          </button>
        )}
        {request.status === 1 && request.submissionCount > 0 && !onFulfill && (
          <span className="text-[0.6rem] border border-eve-panel-border/30 text-eve-muted/40 px-1.5 py-0.5">
            REVIEWING
          </span>
        )}
      </div>
    </div>
  );
}
