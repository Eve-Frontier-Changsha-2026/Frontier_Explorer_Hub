import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useUIStore } from "@/stores/ui-store";
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
    queryFn: async () => {
      // TODO: Replace with indexer query for IntelListing objects
      // For now, use event-based approach:
      const events = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::intel_market::ListingCreatedEvent` },
        order: "descending",
        limit: 50,
      });
      return events.data;
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildListIntel>[1]) => {
      const tx = new Transaction();
      buildListIntel(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel listed! Complete encryption next." });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildPurchaseIntel>[1]) => {
      const tx = new Transaction();
      buildPurchaseIntel(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel purchased! Decrypt to view." });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildFulfillRequest>[1]) => {
      const tx = new Transaction();
      buildFulfillRequest(tx, params);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-market"] });
      addToast({ type: "success", message: "Intel submitted to bounty." });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Parameters<typeof buildCancelListing>[1]) => {
      const tx = new Transaction();
      buildCancelListing(tx, params);
      return signAndExecute({ transaction: tx as never });
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
