"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletBridge } from "@/hooks/use-wallet-bridge";
import { WalletSignDialog } from "./WalletSignDialog";

interface PortalPreviewProps {
  url: string;
  name: string;
  linkId: string;
}

export function PortalPreview({ url, name, linkId }: PortalPreviewProps) {
  const router = useRouter();
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const iframeRef = useCallback((node: HTMLIFrameElement | null) => { setIframeEl(node); }, []);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [retryKey, setRetryKey] = useState(0);

  const { pendingSign, approvePendingSign, rejectPendingSign } = useWalletBridge(iframeEl);

  useEffect(() => {
    setStatus("loading");
    const timer = setTimeout(() => {
      setStatus((prev) => (prev === "loading" ? "failed" : prev));
    }, 5000);

    const handleLoad = () => {
      clearTimeout(timer);
      setStatus("loaded");
    };
    iframeEl?.addEventListener("load", handleLoad);

    return () => {
      clearTimeout(timer);
      iframeEl?.removeEventListener("load", handleLoad);
    };
  }, [url, retryKey, iframeEl]);

  const handleRetry = () => {
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-full min-h-[300px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-eve-panel-border">
        <p className="text-xs text-eve-cold truncate">{name}</p>
        <button
          onClick={() => router.push(`/portal/${linkId}`)}
          className="text-[0.66rem] text-eve-muted hover:text-eve-text border border-eve-panel-border px-2 py-0.5 cursor-pointer"
        >
          Fullscreen →
        </button>
      </div>

      <div className="flex-1 relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-eve-panel">
            <p className="text-xs text-eve-muted animate-pulse-dot">Loading...</p>
          </div>
        )}
        {status === "failed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-eve-panel gap-2">
            <p className="text-xs text-eve-muted">This site may not allow embedding</p>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="text-[0.66rem] border border-eve-panel-border text-eve-muted px-2 py-1 cursor-pointer hover:text-eve-text"
              >
                Retry
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.66rem] border border-eve-panel-border text-eve-muted px-2 py-1 hover:text-eve-text"
              >
                Open in Tab ↗
              </a>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={`${url}-${retryKey}`}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          allow="clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className={`w-full h-full border-0 ${status === "failed" ? "hidden" : ""}`}
          title={`Preview: ${name}`}
        />
      </div>

      {pendingSign && (
        <WalletSignDialog
          txBytes={pendingSign.txBytes}
          siteName={name}
          onApprove={approvePendingSign}
          onReject={rejectPendingSign}
        />
      )}
    </div>
  );
}
