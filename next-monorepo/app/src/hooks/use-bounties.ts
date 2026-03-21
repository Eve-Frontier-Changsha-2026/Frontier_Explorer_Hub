"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getActiveBounties } from "@/lib/api-client";
import { buildCreateBounty, buildSubmitForBounty, buildRefundExpiredBounty } from "@/lib/ptb/bounty";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "./use-auth";
import type { GridCell } from "@/types";

const CLOCK_ID = "0x6";

export function useBounties() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ["bounties"],
    queryFn: getActiveBounties,
    enabled: isAuthenticated,
    staleTime: 30_000
  });

  const createBounty = useMutation({
    mutationFn: async (params: { targetRegion: GridCell; intelTypesWanted: number[]; rewardMist: number; deadlineMs: number }) => {
      const tx = new Transaction();
      buildCreateBounty(tx, params.targetRegion, params.intelTypesWanted, params.rewardMist, params.deadlineMs, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bounties"] });
      addToast({ type: "success", message: "Bounty created!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Create bounty failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    }
  });

  const claimBounty = useMutation({
    mutationFn: async ({ bountyId, intelId }: { bountyId: string; intelId: string }) => {
      const tx = new Transaction();
      buildSubmitForBounty(tx, bountyId, intelId, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bounties"] });
      addToast({ type: "success", message: "Bounty claimed!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Claim failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    }
  });

  const refundBounty = useMutation({
    mutationFn: async ({ bountyId }: { bountyId: string }) => {
      const tx = new Transaction();
      const result = await signAndExecute({
        transaction: buildRefundExpiredBounty(tx, bountyId, CLOCK_ID) as never
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bounties"] });
      addToast({ type: "success", message: "Bounty refunded!" });
    }
  });

  return {
    bounties: query.data?.bounties ?? [],
    isLoading: query.isLoading,
    createBounty: createBounty.mutateAsync,
    claimBounty: claimBounty.mutateAsync,
    refundBounty: refundBounty.mutateAsync,
    isCreating: createBounty.isPending,
    isClaiming: claimBounty.isPending
  };
}
