"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getIntel } from "@/lib/api-client";
import { buildUnlockIntel } from "@/lib/ptb/access";
import { buildSubmitIntel, type SubmitIntelParams } from "@/lib/ptb/intel";
import { useUIStore } from "@/stores/ui-store";

const CLOCK_ID = "0x6";

export function useIntelDetail(intelId: string | null) {
  return useQuery({
    queryKey: ["intel", intelId],
    queryFn: () => getIntel(intelId!),
    enabled: !!intelId
  });
}

export function useUnlockIntel() {
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  return useMutation({
    mutationFn: async ({ intelId, priceMist, maxPriceMist }: { intelId: string; priceMist: number; maxPriceMist: number }) => {
      const tx = new Transaction();
      buildUnlockIntel(tx, intelId, priceMist, maxPriceMist, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["intel", vars.intelId] });
      addToast({ type: "success", message: "Intel unlocked!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Unlock failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    }
  });
}

export function useSubmitIntel() {
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  return useMutation({
    mutationFn: async (params: SubmitIntelParams) => {
      const tx = new Transaction();
      buildSubmitIntel(tx, params, CLOCK_ID);
      const result = await signAndExecute({ transaction: tx as never });
      setPendingTx(result.digest);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      addToast({ type: "success", message: "Intel submitted!" });
      setPendingTx(null);
    },
    onError: (err) => {
      addToast({ type: "error", message: `Submit failed: ${String((err as Error).message ?? err)}` });
      setPendingTx(null);
    }
  });
}
