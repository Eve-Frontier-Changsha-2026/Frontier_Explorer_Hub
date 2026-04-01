"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

type Section = "listings" | "purchases" | "requests" | "submissions";

export function MyActivity() {
  const account = useCurrentAccount();
  const [expanded, setExpanded] = useState<Set<Section>>(new Set(["listings", "purchases"]));

  const toggle = (s: Section) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  if (!account) {
    return (
      <div className="border border-eve-panel-border p-6 bg-eve-panel text-center">
        <div className="text-xs text-eve-muted">Connect wallet to view activity</div>
      </div>
    );
  }

  const sectionClass = "border border-eve-panel-border bg-eve-panel mb-2";
  const headerClass = "flex justify-between items-center p-3 cursor-pointer hover:bg-[rgba(16,22,31,0.5)]";
  const titleClass = "text-xs tracking-wide uppercase text-eve-cold";

  return (
    <div>
      {/* MY LISTINGS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("listings")}>
          <span className={titleClass}>My Listings</span>
          <span className="text-eve-muted text-xs">{expanded.has("listings") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("listings") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No listings yet
            </div>
          </div>
        )}
      </div>

      {/* MY PURCHASES */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("purchases")}>
          <span className={titleClass}>My Purchases</span>
          <span className="text-eve-muted text-xs">{expanded.has("purchases") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("purchases") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No purchases yet
            </div>
          </div>
        )}
      </div>

      {/* MY REQUESTS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("requests")}>
          <span className={titleClass}>My Requests</span>
          <span className="text-eve-muted text-xs">{expanded.has("requests") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("requests") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No requests yet
            </div>
          </div>
        )}
      </div>

      {/* MY SUBMISSIONS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("submissions")}>
          <span className={titleClass}>My Submissions</span>
          <span className="text-eve-muted text-xs">{expanded.has("submissions") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("submissions") && (
          <div className="px-3 pb-3">
            <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">
              No submissions yet
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
