"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getSubscriptionStatus } from "@/lib/api-client";
import { buildSubscribe, buildRenew } from "@/lib/ptb/subscription";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "./use-auth";

const CLOCK_ID = "0x6";

export function useSubscription() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscriptionStatus,
    enabled: isAuthenticated,
    staleTime: 30_000
  });

  const subscribe = useMutation({
    mutationFn: async ({ days, priceMist }: { days: number; priceMist: number }) => {
      const tx = new Transaction();
      buildSubscribe(tx, days, priceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      addToast({ type: "success", message: "Subscription activated!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Subscribe failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    }
  });

  const renew = useMutation({
    mutationFn: async ({ nftId, days, priceMist }: { nftId: string; days: number; priceMist: number }) => {
      const tx = new Transaction();
      buildRenew(tx, nftId, days, priceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      addToast({ type: "success", message: "Subscription renewed!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Renew failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    }
  });

  return {
    subscription: query.data,
    isLoading: query.isLoading,
    isPremium: query.data?.tier === 1 && query.data?.isActive,
    subscribe: subscribe.mutateAsync,
    renew: renew.mutateAsync,
    isSubscribing: subscribe.isPending,
    isRenewing: renew.isPending
  };
}
