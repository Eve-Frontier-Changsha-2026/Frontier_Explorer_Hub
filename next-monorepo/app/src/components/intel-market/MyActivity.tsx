"use client";

import { useState } from "react";
import { useCurrentAccount, useSuiClient, useSignPersonalMessage } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { INTEL_TYPE_LABELS } from "@/lib/constants";
import { getOrCreateSessionKey, sealDecryptListingWithKey, sealDecryptRequest, createSessionKey } from "@/lib/seal";
import { useAcceptAndRate, useSellerProfile } from "@/hooks/use-intel-market";
import { DecryptedIntelView } from "./DecryptedIntelView";
import type { IntelListingV2, IntelRequestV2 } from "@/types";

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
  const [decryptedMap, setDecryptedMap] = useState<Record<string, { exactCoords: { x: string; y: string; z: string } | null; description: string }>>({});
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
    queryFn: async (): Promise<IntelRequestV2[]> => {
      if (!account) return [];
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::RequestCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      const myEvents = events.data.filter((e) => e.sender === account.address);
      if (myEvents.length === 0) return [];
      const ids = myEvents.map((e) => (e.parsedJson as { request_id: string }).request_id);
      const objects = await client.multiGetObjects({ ids, options: { showContent: true } });
      return objects
        .filter((o) => o.data?.content?.dataType === "moveObject")
        .map((o) => {
          const f = (o.data!.content as { fields: Record<string, unknown> }).fields;
          return {
            id: (f.id as { id: string }).id,
            buyer: f.buyer as string,
            title: new TextDecoder().decode(new Uint8Array(f.title as number[])),
            intelType: Number(f.intel_type),
            regionId: Number(f.region_id),
            description: new TextDecoder().decode(new Uint8Array(f.description as number[])),
            rewardMist: Number(f.reward),
            deadline: Number(f.deadline),
            status: Number(f.status),
            firstSubmissionAt: f.first_submission_at ? Number(f.first_submission_at) : null,
            submissionCount: Number(f.submission_count),
            selectedSeller: (f.selected_seller as string) || null,
            createdAt: Number(f.created_at),
          } satisfies IntelRequestV2;
        });
    },
    enabled: !!account,
    refetchInterval: 30_000,
  });

  // Query submissions by current user (via SubmissionPostedEvent)
  const { data: mySubmissions, isLoading: loadingSubmissions } = useQuery({
    queryKey: ["intel-market", "my-submissions", account?.address],
    queryFn: async (): Promise<{ requestId: string; submissionCount: number; request: IntelRequestV2 | null }[]> => {
      if (!account) return [];
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::SubmissionPostedEvent` },
        order: "descending",
        limit: 50,
      });
      const myEvents = events.data.filter(
        (e) => (e.parsedJson as { seller?: string })?.seller === account.address,
      );
      if (myEvents.length === 0) return [];
      // Deduplicate by request_id (keep latest)
      const seen = new Map<string, { requestId: string; submissionCount: number }>();
      for (const e of myEvents) {
        const p = e.parsedJson as { request_id: string; submission_count: number };
        if (!seen.has(p.request_id)) {
          seen.set(p.request_id, { requestId: p.request_id, submissionCount: Number(p.submission_count) });
        }
      }
      const entries = Array.from(seen.values());
      const ids = entries.map((e) => e.requestId);
      const objects = await client.multiGetObjects({ ids, options: { showContent: true } });
      return entries.map((entry, i) => {
        const o = objects[i];
        let request: IntelRequestV2 | null = null;
        if (o?.data?.content?.dataType === "moveObject") {
          const f = (o.data.content as { fields: Record<string, unknown> }).fields;
          request = {
            id: (f.id as { id: string }).id,
            buyer: f.buyer as string,
            title: new TextDecoder().decode(new Uint8Array(f.title as number[])),
            intelType: Number(f.intel_type),
            regionId: Number(f.region_id),
            description: new TextDecoder().decode(new Uint8Array(f.description as number[])),
            rewardMist: Number(f.reward),
            deadline: Number(f.deadline),
            status: Number(f.status),
            firstSubmissionAt: f.first_submission_at ? Number(f.first_submission_at) : null,
            submissionCount: Number(f.submission_count),
            selectedSeller: (f.selected_seller as string) || null,
            createdAt: Number(f.created_at),
          };
        }
        return { ...entry, request };
      });
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
              <RequestReviewCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </div>

      {/* MY SUBMISSIONS */}
      <div className={sectionClass}>
        <div className={headerClass} onClick={() => toggle("submissions")}>
          <span className={titleClass}>My Submissions ({mySubmissions?.length ?? 0})</span>
          <span className="text-eve-muted text-xs">{expanded.has("submissions") ? "▾" : "▸"}</span>
        </div>
        {expanded.has("submissions") && (
          <div className="px-3 pb-3">
            {loadingSubmissions && <div className="text-[0.6rem] text-eve-muted text-center py-2">Loading...</div>}
            {!loadingSubmissions && (!mySubmissions || mySubmissions.length === 0) && (
              <div className="text-[0.65rem] text-eve-muted/50 text-center py-4">No submissions yet</div>
            )}
            {mySubmissions?.map((s) => {
              const req = s.request;
              const won = req?.selectedSeller === account.address;
              const completed = req?.status === 2;
              return (
                <div key={s.requestId} className="border border-eve-panel-border/40 bg-[rgba(12,16,24,0.6)] p-2 mb-1.5">
                  {req ? (
                    <>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-[0.68rem] text-eve-text truncate">{req.title}</div>
                          <div className="text-[0.58rem] text-eve-muted">
                            {INTEL_TYPE_LABELS[req.intelType]} · Region {req.regionId} · {req.submissionCount} submission{req.submissionCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <div className="text-right ml-2">
                          <div className="text-[0.63rem] text-eve-gold">{(req.rewardMist / 1e9).toFixed(3)} SUI</div>
                          <div className={`text-[0.55rem] ${
                            won ? "text-eve-safe" : completed ? "text-eve-danger" : REQ_COLORS[req.status]
                          }`}>
                            {won ? "WON ✓" : completed ? "NOT SELECTED" : REQ_STATUS[req.status]}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="text-[0.6rem] text-eve-text font-mono truncate">{s.requestId.slice(0, 16)}...</div>
                      <div className="text-[0.55rem] text-eve-muted">SUBMITTED</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Request Review Card — expandable with submissions
// ═══════════════════════════════════════════════

const REQ_STATUS: Record<number, string> = { 0: "OPEN", 1: "REVIEWING", 2: "COMPLETED", 3: "CANCELLED", 4: "EXPIRED" };
const REQ_COLORS: Record<number, string> = { 0: "text-eve-safe", 1: "text-eve-warn", 2: "text-eve-gold", 3: "text-eve-danger", 4: "text-eve-muted" };

interface Submission { seller: string; submittedAt: number; objectId: string; encryptedPayload: number[] }

function RequestReviewCard({ request: r }: { request: IntelRequestV2 }) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const [open, setOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [rating, setRating] = useState(4);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, { exactCoords: { x: string; y: string; z: string } | null; description: string }>>({});
  const [decryptingId, setDecryptingId] = useState<string | null>(null);
  const [decryptErrors, setDecryptErrors] = useState<Record<string, string>>({});
  const acceptAndRate = useAcceptAndRate();
  const isExpired = r.deadline > 0 && Date.now() > r.deadline && r.status === 0;
  const canReview = r.status === 1 && r.submissionCount > 0;

  const loadSubmissions = async () => {
    if (submissions.length > 0) return;
    setLoadingSubs(true);
    try {
      const dynFields = await client.getDynamicFields({ parentId: r.id });
      const subs: Submission[] = [];
      for (const f of dynFields.data) {
        const obj = await client.getObject({ id: f.objectId, options: { showContent: true } });
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = (obj.data.content as { fields: Record<string, unknown> }).fields;
          // Dynamic field structure: fields.value = { type, fields: { seller, submitted_at, ... } }
          const valWrapper = fields.value as { fields?: Record<string, unknown> } | undefined;
          const val = valWrapper?.fields;
          if (val && val.seller) {
            subs.push({
              seller: val.seller as string,
              submittedAt: Number(val.submitted_at),
              objectId: f.objectId,
              encryptedPayload: val.encrypted_payload as number[],
            });
          }
        }
      }
      setSubmissions(subs);
    } finally {
      setLoadingSubs(false);
    }
  };

  const handleDecryptSubmission = async (sub: Submission) => {
    if (!account) return;
    setDecryptingId(sub.objectId);
    setDecryptErrors((prev) => { const n = { ...prev }; delete n[sub.objectId]; return n; });
    try {
      // Find buyer's RequestViewerReceipt for this request
      const receipts = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${PACKAGE_ID}::intel_market::RequestViewerReceipt` },
        options: { showContent: true },
      });
      const receipt = receipts.data.find((rc) => {
        if (rc.data?.content?.dataType !== "moveObject") return false;
        const f = (rc.data.content as { fields: Record<string, unknown> }).fields;
        return f.request_id === r.id;
      });
      if (!receipt?.data) throw new Error("No viewer receipt found for this request");
      const receiptId = receipt.data.objectId;

      const sessionKey = await getOrCreateSessionKey(client, account.address, signPersonalMessage);
      const data = await sealDecryptRequest(
        client,
        sessionKey,
        new Uint8Array(sub.encryptedPayload),
        receiptId,
      );
      setDecryptedMap((prev) => ({ ...prev, [sub.objectId]: data }));
    } catch (e) {
      setDecryptErrors((prev) => ({ ...prev, [sub.objectId]: e instanceof Error ? e.message : "Unknown error" }));
    } finally {
      setDecryptingId(null);
    }
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && canReview) loadSubmissions();
  };

  const handleAccept = async (sellerAddr: string) => {
    // SellerProfile is a shared object — query via events, not getOwnedObjects
    const profileEvents = await client.queryEvents({
      query: { MoveEventType: `${PACKAGE_ID}::intel_market::ProfileCreatedEvent` },
      limit: 50,
    });
    const profileEvent = profileEvents.data.find(
      (e) => (e.parsedJson as { seller?: string })?.seller === sellerAddr,
    );
    const profileId = (profileEvent?.parsedJson as { profile_id?: string })?.profile_id;
    if (!profileId) {
      alert("Seller has no profile. Cannot accept.");
      return;
    }
    await acceptAndRate.mutateAsync({
      requestId: r.id,
      profileId,
      sellerAddr,
      rating,
    });
  };

  return (
    <div className="border border-eve-panel-border/40 bg-[rgba(12,16,24,0.6)] mb-1.5">
      <div className="flex justify-between items-center p-2 cursor-pointer hover:bg-[rgba(16,22,31,0.5)]" onClick={handleToggle}>
        <div className="flex-1">
          <div className="text-[0.68rem] text-eve-text truncate">{r.title}</div>
          <div className="text-[0.58rem] text-eve-muted">
            {INTEL_TYPE_LABELS[r.intelType]} · Region {r.regionId} · {r.submissionCount} submission{r.submissionCount !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[0.63rem] text-eve-gold">{(r.rewardMist / 1e9).toFixed(3)} SUI</div>
          <div className={`text-[0.55rem] ${isExpired ? "text-eve-muted" : REQ_COLORS[r.status]}`}>
            {isExpired ? "EXPIRED" : REQ_STATUS[r.status]}
          </div>
        </div>
        <span className="text-eve-muted text-xs ml-2">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div className="px-2 pb-2 border-t border-eve-panel-border/20">
          {!canReview && (
            <div className="text-[0.6rem] text-eve-muted py-2">
              {r.status === 0 ? "Waiting for submissions..." : r.status === 2 ? "Completed." : "No actions available."}
            </div>
          )}
          {canReview && loadingSubs && (
            <div className="text-[0.6rem] text-eve-muted py-2">Loading submissions...</div>
          )}
          {canReview && !loadingSubs && submissions.length === 0 && (
            <div className="text-[0.6rem] text-eve-muted py-2">No submissions found.</div>
          )}
          {canReview && submissions.map((sub) => (
            <div key={sub.objectId} className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.6)] p-2 mt-1.5">
              <div className="text-[0.6rem] text-eve-text font-mono">{sub.seller.slice(0, 10)}...{sub.seller.slice(-6)}</div>
              <div className="text-[0.55rem] text-eve-muted">
                Submitted {new Date(sub.submittedAt).toLocaleString()}
              </div>

              {/* Decrypt button */}
              {!decryptedMap[sub.objectId] && !decryptErrors[sub.objectId] && (
                <button
                  onClick={() => handleDecryptSubmission(sub)}
                  disabled={decryptingId === sub.objectId}
                  className="mt-1.5 text-[0.6rem] border border-eve-cold/40 text-eve-cold px-2 py-0.5 hover:bg-eve-cold/10 disabled:opacity-40"
                >
                  {decryptingId === sub.objectId ? "Decrypting..." : "🔓 DECRYPT SUBMISSION"}
                </button>
              )}

              {/* Decrypted content */}
              {decryptedMap[sub.objectId] && (
                <div className="mt-1.5 border border-eve-safe/20 bg-eve-safe/5 p-2">
                  <div className="text-[0.6rem] text-eve-safe mb-1">Decrypted Intel:</div>
                  <div className="text-[0.6rem] text-eve-text">{decryptedMap[sub.objectId].description}</div>
                  {decryptedMap[sub.objectId].exactCoords && (
                    <div className="text-[0.55rem] text-eve-muted mt-0.5">
                      Coords: ({decryptedMap[sub.objectId].exactCoords!.x}, {decryptedMap[sub.objectId].exactCoords!.y}, {decryptedMap[sub.objectId].exactCoords!.z})
                    </div>
                  )}
                </div>
              )}

              {/* Decrypt error */}
              {decryptErrors[sub.objectId] && (
                <div className="mt-1.5 border border-eve-danger/30 bg-eve-danger/5 p-2">
                  <div className="text-[0.6rem] text-eve-danger">{decryptErrors[sub.objectId]}</div>
                  <button onClick={() => handleDecryptSubmission(sub)} className="text-[0.55rem] border border-eve-panel-border text-eve-muted px-1.5 py-0.5 mt-1 hover:text-eve-text">RETRY</button>
                </div>
              )}

              {/* Accept & Rate — only show after decryption */}
              {decryptedMap[sub.objectId] && (
                <div className="flex items-center gap-2 mt-1.5">
                  <label className="text-[0.55rem] text-eve-muted">Rating:</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="text-[0.6rem] bg-transparent border border-eve-panel-border text-eve-text px-1 py-0.5"
                  >
                    {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}/5</option>)}
                  </select>
                  <button
                    onClick={() => handleAccept(sub.seller)}
                    disabled={acceptAndRate.isPending}
                    className="text-[0.6rem] border border-eve-safe/40 text-eve-safe px-2 py-0.5 hover:bg-eve-safe/10 disabled:opacity-40"
                  >
                    {acceptAndRate.isPending ? "Processing..." : "✓ ACCEPT & RELEASE REWARD"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
