"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { WalletBridgeHost } from "@/lib/wallet-bridge/host";
import { SUI_NETWORK } from "@/lib/constants";

interface PendingSign {
  id: string;
  txBytes: string;
}

export function useWalletBridge(iframe: HTMLIFrameElement | null) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const hostRef = useRef<WalletBridgeHost | null>(null);
  const [host, setHost] = useState<WalletBridgeHost | null>(null);
  const [pendingSign, setPendingSign] = useState<PendingSign | null>(null);

  // Create/destroy host when iframe changes
  useEffect(() => {
    if (!iframe) return;

    const hostInstance = new WalletBridgeHost(iframe);
    hostRef.current = hostInstance;
    setHost(hostInstance);
    const host = hostInstance;

    host.onConnectRequest(() => {
      if (account?.address) {
        host.broadcastState(account.address, SUI_NETWORK);
      } else {
        host.broadcastDisconnect();
      }
    });

    host.onSignRequest((id, txBytes) => {
      setPendingSign({ id, txBytes });
    });

    // Broadcast initial state
    if (account?.address) {
      host.broadcastState(account.address, SUI_NETWORK);
    }

    return () => {
      hostInstance.destroy();
      hostRef.current = null;
      setHost(null);
    };
  }, [iframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-broadcast when account changes
  useEffect(() => {
    if (!hostRef.current) return;
    if (account?.address) {
      hostRef.current.broadcastState(account.address, SUI_NETWORK);
    } else {
      hostRef.current.broadcastDisconnect();
    }
  }, [account?.address]);

  const approvePendingSign = useCallback(async () => {
    if (!pendingSign || !hostRef.current) return;
    const { id, txBytes } = pendingSign;
    try {
      const tx = Transaction.from(fromBase64(txBytes));
      const result = await signAndExecute({ transaction: tx as never });
      hostRef.current.sendSignResponse(id, {
        digest: result.digest,
      });
    } catch (err) {
      hostRef.current.sendSignResponse(id, {
        error: err instanceof Error ? err.message : "Signing failed",
      });
    }
    setPendingSign(null);
  }, [pendingSign, signAndExecute]);

  const rejectPendingSign = useCallback(() => {
    if (!pendingSign || !hostRef.current) return;
    hostRef.current.sendSignResponse(pendingSign.id, {
      error: "User rejected the transaction",
    });
    setPendingSign(null);
  }, [pendingSign]);

  return {
    host,
    pendingSign,
    approvePendingSign,
    rejectPendingSign,
  };
}
