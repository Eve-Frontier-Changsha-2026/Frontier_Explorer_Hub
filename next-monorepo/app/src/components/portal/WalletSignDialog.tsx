"use client";

interface WalletSignDialogProps {
  txBytes: string;
  siteName: string;
  onApprove: () => void;
  onReject: () => void;
}

export function WalletSignDialog({ txBytes, siteName, onApprove, onReject }: WalletSignDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="border border-eve-panel-border bg-eve-panel p-4 max-w-md w-full mx-4">
        <h3 className="text-sm text-eve-cold uppercase tracking-wide">Transaction Request</h3>
        <p className="mt-2 text-xs text-eve-text">
          <span className="text-eve-gold">{siteName}</span> requests a transaction signature.
        </p>
        <div className="mt-3 p-2 bg-[rgba(8,11,16,0.6)] border border-eve-panel-border overflow-x-auto">
          <p className="text-[0.66rem] text-eve-muted font-mono break-all">
            {txBytes.length > 120 ? `${txBytes.slice(0, 120)}...` : txBytes}
          </p>
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={onReject}
            className="text-xs border border-eve-panel-border text-eve-muted px-3 py-1.5 cursor-pointer hover:text-eve-text hover:border-eve-danger"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="text-xs border border-eve-gold/60 text-eve-gold px-3 py-1.5 cursor-pointer hover:bg-eve-gold/10"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
