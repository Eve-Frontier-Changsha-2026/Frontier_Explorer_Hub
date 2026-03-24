"use client";

import type { ClaimTicket } from "@/types";
import { CharacterName } from "@/components/CharacterName";

interface ClaimTicketListProps {
  hunters: ClaimTicket[];
  currentAddress?: string;
}

export function ClaimTicketList({ hunters, currentAddress }: ClaimTicketListProps) {
  if (hunters.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-[0.66rem] text-eve-muted mb-1 uppercase tracking-wide">Claim Tickets</p>
      <div className="grid gap-1">
        {hunters.map((h) => (
          <div
            key={h.hunter}
            className="flex items-center justify-between border border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] px-2 py-1.5"
          >
            <span className="text-xs truncate max-w-[200px]">
              <CharacterName address={h.hunter} className="text-xs" />
              {h.hunter === currentAddress && (
                <span className="text-eve-gold ml-1">(you)</span>
              )}
            </span>
            <span className="text-xs text-eve-muted font-mono">
              {(h.stakeAmount / 1_000_000_000).toFixed(2)} SUI
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
