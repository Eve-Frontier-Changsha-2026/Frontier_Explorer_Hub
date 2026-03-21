"use client";

import { useMutation } from "@tanstack/react-query";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { buildUsePlugin } from "@/lib/ptb/marketplace";
import { useUIStore } from "@/stores/ui-store";

const CLOCK_ID = "0x6";

export function usePlugins() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);

  const usePlugin = useMutation({
    mutationFn: async ({ pluginId, priceMist }: { pluginId: string; priceMist: number }) => {
      const tx = new Transaction();
      buildUsePlugin(tx, pluginId, priceMist, CLOCK_ID);
      return signAndExecute({ transaction: tx as never });
    },
    onSuccess: () => {
      addToast({ type: "success", message: "Plugin access granted!" });
    },
    onError: (err) => {
      addToast({ type: "error", message: `Plugin payment failed: ${String((err as Error).message ?? err)}` });
    }
  });

  return {
    usePlugin: usePlugin.mutateAsync,
    isPaying: usePlugin.isPending
  };
}
