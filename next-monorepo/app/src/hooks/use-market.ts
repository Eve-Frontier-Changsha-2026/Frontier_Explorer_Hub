"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getMarketListings } from "@/lib/api-client";
import {
  buildListIntel,
  buildPurchaseIntel,
  buildDelistIntel,
  buildUpdatePrice,
} from "@/lib/ptb/market";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "./use-auth";

const CLOCK_ID = "0x6";

export function useMarket(params?: { region?: number; type?: number; sort?: string }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ["market-listings", params],
    queryFn: () => getMarketListings(params),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const listIntel = useMutation({
    mutationFn: async (p: {
      intelId: string;
      priceMist: number;
      maxBuyers: number;
      expiryMs: number;
      encryptedPayload: Uint8Array;
    }) => {
      const tx = new Transaction();
      buildListIntel(tx, p.intelId, p.priceMist, p.maxBuyers, p.expiryMs, p.encryptedPayload, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Intel listed!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `List failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    },
  });

  const purchaseIntel = useMutation({
    mutationFn: async ({ listingId, priceMist }: { listingId: string; priceMist: number }) => {
      const tx = new Transaction();
      buildPurchaseIntel(tx, listingId, priceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Intel purchased!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Purchase failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    },
  });

  const delistIntel = useMutation({
    mutationFn: async ({ listingId }: { listingId: string }) => {
      const tx = new Transaction();
      buildDelistIntel(tx, listingId);
      const result = await signAndExecute({ transaction: tx as never });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Listing removed!" });
    },
  });

  const updatePrice = useMutation({
    mutationFn: async ({ listingId, newPriceMist }: { listingId: string; newPriceMist: number }) => {
      const tx = new Transaction();
      buildUpdatePrice(tx, listingId, newPriceMist);
      const result = await signAndExecute({ transaction: tx as never });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market-listings"] });
      addToast({ type: "success", message: "Price updated!" });
    },
  });

  return {
    listings: query.data?.listings ?? [],
    isLoading: query.isLoading,
    listIntel: listIntel.mutateAsync,
    purchaseIntel: purchaseIntel.mutateAsync,
    delistIntel: delistIntel.mutateAsync,
    updatePrice: updatePrice.mutateAsync,
    isListing: listIntel.isPending,
    isPurchasing: purchaseIntel.isPending,
  };
}
