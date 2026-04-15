"use client";

import { useState } from "react";
import { useCurrentAccount, useSuiClient, useSignPersonalMessage } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { getOrCreateSessionKey, sealDecryptListingWithKey } from "@/lib/seal";
import { DecryptedIntelView } from "./DecryptedIntelView";
import type { IntelListingV2 } from "@/types";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;

type Section = "listings" | "purchases" | "requests" | "submissions";

interface PurchaseWithListing {
  receiptId: string;
  listingId: string;
  buyer: string;
  listing: IntelListingV2 | null;
}

function parseListingFields(f: Record<string, unknown>): IntelListingV2 {
  const meta = (f.public_metadata as { fields: Record<string, unknown> }).fields;
  return {
    id: (f.id as { id: string }).id,
    seller: f.seller as string,
    title: new TextDecoder().decode(new Uint8Array(f.title as number[])),
    publicMetadata: {
      regionId: Number(meta.region_id),
      sectorX: Number(meta.sector_x),
      sectorY: Number(meta.sector_y),
      sectorZ: Number(meta.sector_z),
      intelType: Number(meta.intel_type),
      severity: Number(meta.severity),
      expiry: Number(meta.expiry),
    },
    priceMist: Number(f.price_mist),
    status: Number(f.status),
    buyer: (f.buyer as string) || null,
    purchasedAt: f.purchased_at ? Number(f.purchased_at) : null,
    createdAt: Number(f.created_at),
    isSealed: (f.encrypted_payload as unknown[])?.length > 0,
  };
}

const STATUS_LABELS: Record<number, string> = { 0: "ACTIVE", 1: "SOLD", 2: "EXPIRED", 3: "CANCELLED" };
const STATUS_COLORS: Record<number, string> = { 0: "text-eve-safe", 1: "text-eve-gold", 2: "text-eve-muted", 3: "text-eve-danger" };

function ListingRow({ listing }: { listing: IntelListingV2 }) {
  return (
    <div className="flex justify-between items-center border-b border-eve-panel-border/30 py-1.5 px-1">
      <div className="flex-1">
        <div className="text-[0.68rem] text-eve-text truncate">{listing.title}</div>
        <div className="text-[0.58rem] text-eve-muted">
          {INTEL_TYPE_LABELS[listing.publicMetadata.intelType]} · Region {listing.publicMetadata.regionId}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[0.63rem] text-eve-gold">{(listing.priceMist / 1e9).toFixed(3)} SUI</div>
        <div className={`text-[0.55rem] ${STATUS_COLORS[listing.status]}`}>{STATUS_LABELS[listing.status]}</div>
      </div>
    </div>
  );
}

export function MyActivity() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const [expanded, setExpanded] = useState<Set<Section>>(new Set(["listings", "purchases"]));
  const [decryptingId, setDecryptingId] = useState<string | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, { exactCoords: { x: string; y: string; z: string }; description: string }>>({});
  const [decryptErrors, setDecryptErrors] = useState<Record<string, string>>({});

  const handleDecrypt = async (purchase: PurchaseWithListing) => {
    if (!account) return;
    try {
      setDecryptingId(purchase.receiptId);
      setDecryptErrors((prev) => { const n = { ...prev }; delete n[purchase.receiptId]; return n; });
      const sessionKey = await getOrCreateSessionKey(client, account.address, signPersonalMessage);
      const data = await sealDecryptListingWithKey(client, sessionKey, purchase.listingId, purchase.receiptId);
      setDecryptedMap((prev) => ({ ...prev, [purchase.receiptId]: data }));
    } catch (e) {
      setDecryptErrors((prev) => ({ ...prev, [purchase.receiptId]: e instanceof Error ? e.message : "Unknown error" }));
    } finally {
      setDecryptingId(null);
    }
  };

  const toggle = (s: Section) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  // Query all IntelListing objects created by this user (via events)
  const { data: myListings, isLoading: loadingListings } = useQuery({
    queryKey: ["intel-market", "my-listings", account?.address],
    queryFn: async (): Promise<IntelListingV2[]> => {
      if (!account) return [];
      const events = await client.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::intel_market::ListingCreatedEvent`,
        },
        order: "descending",
        limit: 50,
      });
      const myEvents = events.data.filter((e) => e.sender === account.address);
      if (myEvents.length === 0) return [];
      const ids = myEvents.map((e) => (e.parsedJson as { listing_id: string }).listing_id);
      const objects = await client.multiGetObjects({ ids, options: { showContent: true } });
      return objects
        .filter((o) => o.data?.content?.dataType === "moveObject")
        .map((o) => parseListingFields((o.data!.content as { fields: Record<string, unknown> }).fields));
    },
    enabled: !!account,
    refetchInterval: 30_000,
  });

  // Query purchases (ListingViewerReceipt owned by user) + enrich with listing data
  const { data: myPurchases, isLoading: loadingPurchases } = useQuery({
    queryKey: ["intel-market", "my-purchases", account?.address],
    queryFn: async (): Promise<PurchaseWithListing[]> => {
      if (!account) return [];
      const receipts = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${PACKAGE_ID}::intel_market::ListingViewerReceipt` },
        options: { showContent: true },
      });
      const purchases = receipts.data
        .filter((r) => r.data?.content?.dataType === "moveObject")
        .map((r) => {
          const f = (r.data!.content as { fields: Record<string, unknown> }).fields;
          return {
            receiptId: (f.id as { id: string }).id,
            listingId: f.listing_id as string,
            buyer: f.buyer as string,
          };
        });
      if (purchases.length === 0) return [];
      // Fetch listing objects for details
      const listingIds = purchases.map((p) => p.listingId);
      const objects = await client.multiGetObjects({ ids: listingIds, options: { showContent: true } });
      return purchases.map((p, i) => {
        const o = objects[i];
        let listing: IntelListingV2 | null = null;
        if (o?.data?.content?.dataType === "moveObject") {
          listing = parseListingFields((o.data.content as { fields: Record<string, unknown> }).fields);
        }
        return { ...p, listing };
      });
    },
    enabled: !!account,
    refetchInterval: 30_000,
  });

  // Query bounty requests created by user
  const { data: myRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ["intel-market", "my-requests", account?.address],
    queryFn: async () => {
      if (!account) return [];
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::RequestCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      return events.data
        .filter((e) => e.sender === account.address)
        .map((e) => e.parsedJson as { request_id: string; title: number[]; reward_mist: string; deadline: string });
    },
    enabled: !!account,
    refetchInterval: 30_000,
  });

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
          <span className={titleClass}>My Listings ({myListings?.length ?? 0})</span>
          <span className="text-eve-muted text-xs">{expanded.has("listings") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("listings") && (
          <div className="px-3 pb-3">
            {loadingListings && <div className="text-[0.6rem] text-eve-muted text-center py-2">Loading...</div>}
            {!loadingListings && (!myListings || myListings.length === 0) && (
              <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">No listings yet</div>
            )}
            {myListings?.map((l) => <ListingRow key={l.id} listing={l} />)}
          </div>
        )}
      </div>

      {/* MY PURCHASES */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("purchases")}>
          <span className={titleClass}>My Purchases ({myPurchases?.length ?? 0})</span>
          <span className="text-eve-muted text-xs">{expanded.has("purchases") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("purchases") && (
          <div className="px-3 pb-3">
            {loadingPurchases && <div className="text-[0.6rem] text-eve-muted text-center py-2">Loading...</div>}
            {!loadingPurchases && (!myPurchases || myPurchases.length === 0) && (
              <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">No purchases yet</div>
            )}
            {myPurchases?.map((p) => (
              <div key={p.receiptId} className="border border-eve-panel-border/40 bg-[rgba(12,16,24,0.6)] p-2 mb-1.5">
                {p.listing ? (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-[0.68rem] text-eve-text">{p.listing.title}</div>
                        <div className="text-[0.58rem] text-eve-muted">
                          {INTEL_TYPE_LABELS[p.listing.publicMetadata.intelType]} · Region {p.listing.publicMetadata.regionId} · Sector ({p.listing.publicMetadata.sectorX}, {p.listing.publicMetadata.sectorY}, {p.listing.publicMetadata.sectorZ})
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-[0.63rem] text-eve-gold">{(p.listing.priceMist / 1e9).toFixed(3)} SUI</div>
                        <div className="text-[0.55rem] text-eve-safe">PURCHASED</div>
                      </div>
                    </div>
                    {p.listing.isSealed && !decryptedMap[p.receiptId] && !decryptErrors[p.receiptId] && (
                      <button
                        onClick={() => handleDecrypt(p)}
                        disabled={decryptingId === p.receiptId}
                        className="mt-1.5 text-[0.6rem] border border-eve-gold/40 text-eve-gold px-2 py-0.5 hover:bg-eve-gold/10 disabled:opacity-40"
                      >
                        {decryptingId === p.receiptId ? "DECRYPTING..." : "🔓 DECRYPT INTEL"}
                      </button>
                    )}
                    {decryptedMap[p.receiptId] && (
                      <DecryptedIntelView data={decryptedMap[p.receiptId]} isDecrypting={false} error={null} />
                    )}
                    {decryptErrors[p.receiptId] && (
                      <DecryptedIntelView data={null} isDecrypting={false} error={decryptErrors[p.receiptId]} onRetry={() => handleDecrypt(p)} />
                    )}
                  </>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="text-[0.6rem] text-eve-text font-mono truncate">{p.listingId.slice(0, 16)}...</div>
                    <div className="text-[0.55rem] text-eve-safe">PURCHASED</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MY REQUESTS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("requests")}>
          <span className={titleClass}>My Requests ({myRequests?.length ?? 0})</span>
          <span className="text-eve-muted text-xs">{expanded.has("requests") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("requests") && (
          <div className="px-3 pb-3">
            {loadingRequests && <div className="text-[0.6rem] text-eve-muted text-center py-2">Loading...</div>}
            {!loadingRequests && (!myRequests || myRequests.length === 0) && (
              <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">No requests yet</div>
            )}
            {myRequests?.map((r) => (
              <div key={r.request_id} className="flex justify-between items-center border-b border-eve-panel-border/30 py-1.5 px-1">
                <div className="text-[0.6rem] text-eve-text truncate">
                  {new TextDecoder().decode(new Uint8Array(r.title))}
                </div>
                <div className="text-[0.63rem] text-eve-gold">{(Number(r.reward_mist) / 1e9).toFixed(3)} SUI</div>
              </div>
            ))}
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
