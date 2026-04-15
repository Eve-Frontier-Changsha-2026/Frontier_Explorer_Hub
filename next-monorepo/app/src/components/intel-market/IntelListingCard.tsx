"use client";

import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { RatingStars } from "./RatingStars";
import { CountdownTimer } from "./CountdownTimer";
import type { IntelListingV2 } from "@/types";

const TYPE_COLORS: Record<number, string> = {
  0: "text-eve-safe",    // Resource
  1: "text-eve-danger",  // Threat
  2: "text-eve-warn",    // Wreckage
  3: "text-eve-info",    // Population
};

const TYPE_ICONS: Record<number, string> = {
  0: "◆", 1: "⚠", 2: "▣", 3: "●",
};

interface Props {
  listing: IntelListingV2;
  sellerRating: number;
  sellerTrades: number;
  onBuy?: () => void;
  onCancel?: () => void;
  isMine?: boolean;
}

export function IntelListingCard({ listing, sellerRating, sellerTrades, onBuy, onCancel, isMine }: Props) {
  const meta = listing.publicMetadata;
  const typeColor = TYPE_COLORS[meta.intelType] ?? "text-eve-muted";
  const icon = TYPE_ICONS[meta.intelType] ?? "?";
  const isExpired = meta.expiry > 0 && Date.now() > meta.expiry;

  return (
    <div className="border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] p-2 cursor-pointer hover:border-eve-panel-border/60">
      <div className="flex justify-between items-center">
        <span className={`${typeColor} text-[0.63rem]`}>
          {icon} {INTEL_TYPE_LABELS[meta.intelType]}
        </span>
        <span className="text-eve-gold text-[0.63rem] font-bold">
          {(listing.priceMist / 1_000_000_000).toFixed(2)} SUI
        </span>
      </div>
      <div className="text-[0.7rem] text-eve-text mt-1 truncate">{listing.title}</div>
      <div className="text-[0.6rem] text-eve-muted mt-0.5">
        Region {meta.regionId} · Sector ({meta.sectorX}, {meta.sectorY}, {meta.sectorZ}) · Severity {meta.severity}/10
      </div>
      <div className="flex justify-between items-center mt-1.5">
        <div className="flex items-center gap-2">
          <RatingStars rating={sellerRating} trades={sellerTrades} />
          <CountdownTimer targetMs={meta.expiry} />
        </div>
        <div className="flex gap-1">
          {listing.status === 0 && !isExpired && !isMine && onBuy && (
            <button
              onClick={(e) => { e.stopPropagation(); onBuy(); }}
              className="text-[0.6rem] border border-eve-gold/40 text-eve-gold px-1.5 py-0.5 hover:bg-eve-gold/10"
            >
              BUY
            </button>
          )}
          {listing.status === 0 && isMine && onCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="text-[0.6rem] border border-eve-danger/40 text-eve-danger px-1.5 py-0.5 hover:bg-eve-danger/10"
            >
              CANCEL
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
