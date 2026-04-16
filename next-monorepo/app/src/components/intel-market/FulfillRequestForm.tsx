"use client";

import { useState, useEffect } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useFulfillRequest } from "@/hooks/use-intel-market";

interface Props {
  requestId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function FulfillRequestForm({ requestId, onCancel, onSuccess }: Props) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const fulfillRequest = useFulfillRequest();
  const [plaintext, setPlaintext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [checking, setChecking] = useState(true);

  // Pre-check: has current wallet already submitted?
  useEffect(() => {
    if (!account?.address || !requestId) { setChecking(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const dynFields = await client.getDynamicFields({ parentId: requestId });
        const submissionFields = dynFields.data.filter(
          (f: { objectType?: string }) => f.objectType?.includes("IntelSubmission"),
        );
        if (submissionFields.length === 0) { if (!cancelled) setChecking(false); return; }

        const objs = await client.multiGetObjects({
          ids: submissionFields.map((f) => f.objectId),
          options: { showContent: true },
        });
        const found = objs.some((o) => {
          const fields = o.data?.content?.dataType === "moveObject"
            ? (o.data.content.fields as Record<string, unknown>)
            : null;
          // dynamic field wrapper: fields.value.fields.seller
          const val = fields?.value as { fields?: { seller?: string } } | undefined;
          return val?.fields?.seller === account.address;
        });
        if (!cancelled) {
          setAlreadySubmitted(found);
          setChecking(false);
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [account?.address, requestId, client]);

  const handleSubmit = async () => {
    if (!account || !plaintext.trim() || alreadySubmitted) return;
    setError(null);
    try {
      await fulfillRequest.mutateAsync({ requestId, plaintext });
      setPlaintext("");
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("327")) setError("You have already submitted to this request.");
      else if (msg.includes("320")) setError("This request is no longer open.");
      else if (msg.includes("328")) setError("Request deadline has passed.");
      else setError(msg);
    }
  };

  const inputClass = "w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5";

  return (
    <div className="border border-eve-gold/30 p-3 bg-eve-panel">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm tracking-wide uppercase text-eve-gold">Fulfill Request</div>
        <button onClick={onCancel} className="text-[0.6rem] text-eve-muted hover:text-eve-text">✕ Cancel</button>
      </div>

      <div className="text-[0.6rem] text-eve-muted mb-2 font-mono truncate">
        Request: {requestId.slice(0, 20)}...
      </div>

      {alreadySubmitted ? (
        <div className="border border-eve-gold/20 bg-eve-gold/5 p-3 text-xs text-eve-gold">
          ✓ You have already submitted to this request.
        </div>
      ) : (
        <>
          <textarea
            placeholder="Enter your intel submission (will be encrypted with Seal)..."
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
            className={`${inputClass} mb-2 min-h-[120px] resize-none`}
            maxLength={4096}
            disabled={checking}
          />

          <button
            onClick={handleSubmit}
            disabled={!account || fulfillRequest.isPending || !plaintext.trim() || checking}
            className="w-full border border-eve-gold/40 text-eve-gold py-1.5 text-xs hover:bg-eve-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checking ? "Checking..." : fulfillRequest.isPending ? "Encrypting & Submitting..." : "🔒 SUBMIT INTEL (ENCRYPTED)"}
          </button>
        </>
      )}

      {error && (
        <div className="border border-eve-danger/30 bg-eve-danger/5 p-2 mt-2 text-[0.6rem] text-eve-danger">
          {error}
        </div>
      )}

      <div className="border-t border-eve-panel-border/20 mt-3 pt-2">
        <div className="text-[0.6rem] text-eve-muted/50 leading-relaxed">
          ▸ Your submission will be Seal-encrypted<br />
          ▸ Only the requester can decrypt after accepting<br />
          ▸ Reward released on acceptance
        </div>
      </div>
    </div>
  );
}
