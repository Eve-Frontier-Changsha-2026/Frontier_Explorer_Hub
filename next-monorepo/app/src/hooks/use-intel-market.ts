import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useUIStore } from "@/stores/ui-store";
import { sealEncrypt, sealDecryptListing, sealDecryptRequest, createSessionKey } from "@/lib/seal";
import {
  buildListIntel,
  buildSetEncryptedPayload,
  buildPurchaseIntel,
  buildConfirmAndRate,
  buildAutoRelease,
  buildCancelListing,
  buildPostRequest,
  buildFulfillRequest,
  buildAcceptAndRate,
  buildAutoSettle,
  buildCancelRequest,
} from "@/lib/ptb/intel-market";
import type { IntelListingV2, IntelRequestV2, SellerProfile } from "@/types";

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID!;

// ═══════════════════════════════════════════════
// Query hooks
// ═══════════════════════════════════════════════

export function useIntelListings() {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["intel-market", "listings"],
    queryFn: async (): Promise<IntelListingV2[]> => {
      // 1. Get listing IDs from creation events
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::ListingCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      if (events.data.length === 0) return [];

      // 2. Fetch actual objects for current state
      const ids = events.data.map((e) => (e.parsedJson as { listing_id: string }).listing_id);
      const objects = await client.multiGetObjects({
        ids,
        options: { showContent: true },
      });

      // 3. Parse into IntelListingV2
      return objects
        .filter((o) => o.data?.content?.dataType === "moveObject")
        .map((o) => {
          const f = (o.data!.content as { fields: Record<string, unknown> }).fields;
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
          } satisfies IntelListingV2;
        });
    },
    refetchInterval: 30_000,
  });
}

export function useIntelRequests() {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["intel-market", "requests"],
    queryFn: async () => {
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::RequestCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      return events.data;
    },
    refetchInterval: 30_000,
  });
}

export function useSellerProfile(address: string | undefined) {
  const client = useSuiClient();
  return useQuery({
    queryKey: ["intel-market", "profile", address],
    queryFn: async () => {
      if (!address) return null;
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: `${PACKAGE_ID}::intel_market::SellerProfile` },
      });
      if (objects.data.length === 0) return null;
      const obj = await client.getObject({
        id: objects.data[0].data!.objectId,
        options: { showContent: true },
      });
      return obj.data;
    },
    enabled: !!address,
  });
}

// ═══════════════════════════════════════════════
// Mutation hooks — Sell mode
// ═══════════════════════════════════════════════

function useSignExec() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  return { signAndExecute, addToast };
}

export function useListIntel() {
  const { signAndExecute, addToast } = useSignExec();
  const client = useSuiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildListIntel>[1]) => {
      const tx = new Transaction();
      buildListIntel(tx, params);
      const result = await signAndExecute({ transaction: tx as never });
      // Wait for TX and extract created IntelListing ID
      const details = await client.waitForTransaction({
        digest: result.digest,
        options: { showObjectChanges: true },
      });
      const listing = details.objectChanges?.find(
        (c) => c.type === "created" && c.objectType?.includes("::intel_market::IntelListing")
      );
      if (!listing || listing.type !== "created") throw new Error("Listing object not found in TX result");
      return listing.objectId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel listed! Encrypting..." });
    },
    onError: (e) => addToast({ type: "error", message: `List failed: ${e.message}` }),
  });
}

export function useSetEncryptedPayload() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildSetEncryptedPayload>[1]) => {
      const tx = new Transaction();
      buildSetEncryptedPayload(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel encrypted and sealed." });
    },
    onError: (e) => addToast({ type: "error", message: `Seal failed: ${e.message}` }),
  });
}

export function usePurchaseIntel() {
  const { signAndExecute, addToast } = useSignExec();
  const client = useSuiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildPurchaseIntel>[1]) => {
      const tx = new Transaction();
      buildPurchaseIntel(tx, params);
      const result = await signAndExecute({ transaction: tx as never });
      // Wait for TX and extract ListingViewerReceipt ID
      const details = await client.waitForTransaction({
        digest: result.digest,
        options: { showObjectChanges: true },
      });
      const receipt = details.objectChanges?.find(
        (c: { type: string; objectType?: string }) =>
          c.type === "created" && c.objectType?.includes("::intel_market::ListingViewerReceipt")
      );
      if (!receipt || receipt.type !== "created") throw new Error("Receipt not found in TX result");
      return { digest: result.digest, receiptId: (receipt as { objectId: string }).objectId, listingId: params.listingId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel purchased! Decrypting..." });
    },
    onError: (e) => addToast({ type: "error", message: `Purchase failed: ${e.message}` }),
  });
}

export function useConfirmAndRate() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildConfirmAndRate>[1]) => {
      const tx = new Transaction();
      buildConfirmAndRate(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Confirmed and rated. Payment released." });
    },
    onError: (e) => addToast({ type: "error", message: `Confirm failed: ${e.message}` }),
  });
}

// ═══════════════════════════════════════════════
// Mutation hooks — Bounty mode
// ═══════════════════════════════════════════════

export function usePostRequest() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildPostRequest>[1]) => {
      const tx = new Transaction();
      buildPostRequest(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Request posted. Reward locked." });
    },
    onError: (e) => addToast({ type: "error", message: `Post failed: ${e.message}` }),
  });
}

export function useFulfillRequest() {
  const { signAndExecute, addToast } = useSignExec();
  const client = useSuiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      plaintext: string;
    }) => {
      const encryptedPayload = await sealEncrypt(client, params.plaintext, params.requestId);
      const tx = new Transaction();
      buildFulfillRequest(tx, {
        requestId: params.requestId,
        encryptedPayload,
      });
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel submitted and sealed." });
    },
    onError: (e) => addToast({ type: "error", message: `Fulfill failed: ${e.message}` }),
  });
}

export function useAcceptAndRate() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildAcceptAndRate>[1]) => {
      const tx = new Transaction();
      buildAcceptAndRate(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Accepted and rated. Reward released." });
    },
    onError: (e) => addToast({ type: "error", message: `Accept failed: ${e.message}` }),
  });
}

export function useCancelListing() {
  const { signAndExecute, addToast } = useSignExec();
  const client = useSuiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildCancelListing>[1]) => {
      const tx = new Transaction();
      buildCancelListing(tx, params);
      const result = await signAndExecute({ transaction: tx as never });
      await client.waitForTransaction({ digest: result.digest });
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Listing cancelled." });
    },
    onError: (e) => addToast({ type: "error", message: `Cancel failed: ${e.message}` }),
  });
}

export function useCancelRequest() {
  const { signAndExecute, addToast } = useSignExec();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildCancelRequest>[1]) => {
      const tx = new Transaction();
      buildCancelRequest(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Request cancelled. Reward refunded." });
    },
    onError: (e) => addToast({ type: "error", message: `Cancel failed: ${e.message}` }),
  });
}

// ═══════════════════════════════════════════════
// Decrypt hooks
// ═══════════════════════════════════════════════

/**
 * Decrypt a purchased listing's encrypted payload.
 * Creates a session key (one wallet signature), then decrypts.
 */
export function useDecryptListing() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const addToast = useUIStore((s) => s.addToast);

  return useMutation({
    mutationFn: async (params: { listingId: string; receiptId: string }) => {
      if (!account) throw new Error("Wallet not connected");

      // 1. Fetch encrypted payload from chain
      const obj = await client.getObject({
        id: params.listingId,
        options: { showContent: true },
      });
      const content = obj.data?.content;
      if (!content || content.dataType !== "moveObject") throw new Error("Listing not found");
      const fields = content.fields as Record<string, unknown>;
      const payloadArr = fields.encrypted_payload as number[];
      if (!payloadArr || payloadArr.length === 0) throw new Error("No encrypted payload");
      const encryptedPayload = new Uint8Array(payloadArr);

      // 2. Create session key (one wallet sign)
      const sessionKey = await createSessionKey(
        client,
        account.address,
        signPersonalMessage,
      );

      // 3. Decrypt
      return sealDecryptListing(client, sessionKey, encryptedPayload, params.receiptId);
    },
    onSuccess: () => {
      addToast({ type: "success", message: "Intel decrypted successfully." });
    },
    onError: (e) => {
      addToast({ type: "error", message: `Decryption failed: ${e.message}` });
    },
  });
}

/**
 * Decrypt a bounty request's submitted intel.
 */
export function useDecryptRequest() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const addToast = useUIStore((s) => s.addToast);

  return useMutation({
    mutationFn: async (params: { requestId: string; receiptId: string }) => {
      if (!account) throw new Error("Wallet not connected");

      // 1. Fetch encrypted payload from request's submission
      const dynFields = await client.getDynamicFields({ parentId: params.requestId });
      const submissionField = dynFields.data.find(
        (f: { objectType?: string }) => f.objectType?.includes("IntelSubmission")
      );
      if (!submissionField) throw new Error("No submission found");
      const submissionObj = await client.getObject({
        id: submissionField.objectId,
        options: { showContent: true },
      });
      const subContent = submissionObj.data?.content;
      if (!subContent || subContent.dataType !== "moveObject") throw new Error("Submission not found");
      const subFields = subContent.fields as Record<string, unknown>;
      const payloadArr = subFields.encrypted_payload as number[];
      const encryptedPayload = new Uint8Array(payloadArr);

      // 2. Create session key
      const sessionKey = await createSessionKey(
        client,
        account.address,
        signPersonalMessage,
      );

      // 3. Decrypt
      return sealDecryptRequest(client, sessionKey, encryptedPayload, params.receiptId);
    },
    onSuccess: () => {
      addToast({ type: "success", message: "Bounty intel decrypted." });
    },
    onError: (e) => {
      addToast({ type: "error", message: `Decryption failed: ${e.message}` });
    },
  });
}
