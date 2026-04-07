"use client";

import { useState } from "react";
import { useIntelListings, usePurchaseIntel, useDecryptListing } from "@/hooks/use-intel-market";
import { IntelListingCard } from "./IntelListingCard";
import { DecryptedIntelView } from "./DecryptedIntelView";
import { INTEL_TYPE_LABELS } from "@/lib/constants";

const SORT_OPTIONS = [
  { label: "Newest", key: "newest" },
  { label: "Price ↑", key: "price_asc" },
  { label: "Price ↓", key: "price_desc" },
  { label: "Rating", key: "rating" },
] as const;

export function IntelListingBrowser({ onBuy }: { onBuy?: (listingId: string) => void }) {
  const { data: listings, isLoading } = useIntelListings();
  const purchaseIntel = usePurchaseIntel();
  const decryptListing = useDecryptListing();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<string>("newest");
  const [decryptedData, setDecryptedData] = useState<{ exactCoords: { x: string; y: string; z: string }; description: string } | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);

  const handleBuy = async (listingId: string, priceMist: number) => {
    try {
      setDecryptedData(null);
      setDecryptError(null);
      setActiveListingId(listingId);
      // 1. Purchase
      const { receiptId } = await purchaseIntel.mutateAsync({ listingId, priceMist });
      // 2. Auto-decrypt
      setIsDecrypting(true);
      const data = await decryptListing.mutateAsync({ listingId, receiptId });
      setDecryptedData(data);
    } catch (e) {
      setDecryptError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">Browse Intel</div>

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 Search by title, region, keyword..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5 mb-2"
      />

      {/* Filters + Sort */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter(null)}
            className={`text-[0.6rem] border px-1.5 py-0.5 ${
              typeFilter === null
                ? "border-eve-gold/40 text-eve-gold bg-eve-gold/5"
                : "border-eve-panel-border text-eve-muted"
            }`}
          >
            All
          </button>
          {Object.entries(INTEL_TYPE_LABELS).map(([k, label]) => {
            const colors = ["text-eve-safe", "text-eve-danger", "text-eve-warn", "text-eve-info"];
            return (
              <button
                key={k}
                onClick={() => setTypeFilter(Number(k))}
                className={`text-[0.6rem] border px-1.5 py-0.5 ${
                  typeFilter === Number(k)
                    ? "border-eve-gold/40 bg-eve-gold/5"
                    : "border-eve-panel-border"
                } ${colors[Number(k)]}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-[0.6rem] bg-transparent border border-eve-panel-border text-eve-muted px-1 py-0.5"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Listing cards */}
      <div className="flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {isLoading && <div className="text-xs text-eve-muted p-4">Loading...</div>}
        {/* Placeholder — replace with actual data mapping */}
        <div className="text-xs text-eve-muted p-4 text-center">
          No listings yet. Be the first to sell intel.
        </div>
      </div>

      {activeListingId && (
        <DecryptedIntelView
          data={decryptedData}
          isDecrypting={isDecrypting}
          error={decryptError}
          onRetry={() => handleBuy(activeListingId, 0)}
        />
      )}
    </div>
  );
}
