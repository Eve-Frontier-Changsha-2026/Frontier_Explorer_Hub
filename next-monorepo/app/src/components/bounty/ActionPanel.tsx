"use client";

import { useState } from "react";
import type { BountyRole } from "@/types";

interface ActionPanelProps {
  role: BountyRole;
  bountyId: string;
  metaId: string;
  status: number;
  currentProofStatus: string | null;
  reviewDeadline: number | null;
  verifierCapId: string | null;
  submitProof: (p: { metaId: string; intelId: string; proofUrl: string; proofDescription: string }) => Promise<unknown>;
  resubmitProof: (p: { metaId: string; intelId: string; proofUrl: string; proofDescription: string }) => Promise<unknown>;
  rejectProof: (p: { hunter: string; reason: string; verifierCapId: string }) => Promise<unknown>;
  disputeRejection: (p: { reason: string }) => Promise<unknown>;
  resolveDispute: (p: { hunter: string; approve: boolean }) => Promise<unknown>;
  autoApproveProof: (p: Record<string, never>) => Promise<unknown>;
  isSubmitting: boolean;
}

const INPUT_CLASS = "w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-2";
const BTN_CLASS = "border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-4 py-2.5 uppercase tracking-wide cursor-pointer hover:border-eve-cold/50 disabled:opacity-40 disabled:cursor-not-allowed";

export function ActionPanel({
  role, metaId, status, currentProofStatus, reviewDeadline,
  verifierCapId, submitProof, resubmitProof, rejectProof,
  disputeRejection, resolveDispute, autoApproveProof, isSubmitting,
}: ActionPanelProps) {
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofDesc, setProofDesc] = useState("");
  const [intelId, setIntelId] = useState("");
  const [reason, setReason] = useState("");
  const [hunterAddr, setHunterAddr] = useState("");

  const toggle = (action: string) =>
    setExpandedAction((prev) => (prev === action ? null : action));

  if (role === "viewer") return null;

  // Hunter actions
  if (role === "hunter") {
    return (
      <div className="mt-2 grid gap-2">
        <p className="text-[0.66rem] text-eve-muted uppercase tracking-wide">Hunter Actions</p>

        {/* Submit Proof (when status allows) */}
        {(status === 1 || currentProofStatus === null) && (
          <>
            <button className={BTN_CLASS} onClick={() => toggle("submit")} disabled={isSubmitting}>
              Submit Proof
            </button>
            {expandedAction === "submit" && (
              <div className="grid gap-2 border border-eve-panel-border/40 p-2">
                <input className={INPUT_CLASS} placeholder="Intel Object ID" value={intelId} onChange={(e) => setIntelId(e.target.value)} />
                <input className={INPUT_CLASS} placeholder="Proof URL" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
                <textarea className={INPUT_CLASS} placeholder="Description" rows={2} value={proofDesc} onChange={(e) => setProofDesc(e.target.value)} />
                <p className="text-[0.6rem] text-eve-muted text-right">{proofDesc.length}/500</p>
                <button
                  className={BTN_CLASS}
                  disabled={isSubmitting || !proofUrl || !intelId}
                  onClick={() => submitProof({ metaId, intelId, proofUrl, proofDescription: proofDesc })}
                >
                  {isSubmitting ? "Submitting..." : "Confirm Submit"}
                </button>
              </div>
            )}
          </>
        )}

        {/* Resubmit Proof (after rejection) */}
        {currentProofStatus === "proof_rejected" && (
          <>
            <button className={BTN_CLASS} onClick={() => toggle("resubmit")} disabled={isSubmitting}>
              Resubmit Proof
            </button>
            {expandedAction === "resubmit" && (
              <div className="grid gap-2 border border-eve-panel-border/40 p-2">
                <input className={INPUT_CLASS} placeholder="Intel Object ID" value={intelId} onChange={(e) => setIntelId(e.target.value)} />
                <input className={INPUT_CLASS} placeholder="New Proof URL" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
                <textarea className={INPUT_CLASS} placeholder="Updated description" rows={2} value={proofDesc} onChange={(e) => setProofDesc(e.target.value)} />
                <p className="text-[0.6rem] text-eve-muted text-right">{proofDesc.length}/500</p>
                <button
                  className={BTN_CLASS}
                  disabled={isSubmitting || !proofUrl || !intelId}
                  onClick={() => resubmitProof({ metaId, intelId, proofUrl, proofDescription: proofDesc })}
                >
                  {isSubmitting ? "Resubmitting..." : "Confirm Resubmit"}
                </button>
              </div>
            )}
          </>
        )}

        {/* Dispute Rejection */}
        {currentProofStatus === "proof_rejected" && (
          <>
            <button className={BTN_CLASS} onClick={() => toggle("dispute")} disabled={isSubmitting}>
              Dispute Rejection
            </button>
            {expandedAction === "dispute" && (
              <div className="grid gap-2 border border-amber-400/20 p-2">
                <textarea className={INPUT_CLASS} placeholder="Reason for dispute" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                <p className="text-[0.6rem] text-eve-muted text-right">{reason.length}/500</p>
                <button
                  className={BTN_CLASS}
                  disabled={isSubmitting || !reason}
                  onClick={() => disputeRejection({ reason })}
                >
                  {isSubmitting ? "Filing..." : "File Dispute"}
                </button>
              </div>
            )}
          </>
        )}

        {/* Auto Approve (when review deadline passed) */}
        {reviewDeadline && Date.now() > reviewDeadline && currentProofStatus === "proof_submitted" && (
          <button
            className={BTN_CLASS}
            disabled={isSubmitting}
            onClick={() => autoApproveProof({} as Record<string, never>)}
          >
            {isSubmitting ? "Processing..." : "Claim Auto-Approval"}
          </button>
        )}
      </div>
    );
  }

  // Creator actions
  return (
    <div className="mt-2 grid gap-2">
      <p className="text-[0.66rem] text-eve-muted uppercase tracking-wide">Creator Actions</p>

      {/* Reject Proof */}
      {(status === 2) && (
        <>
          <button className={BTN_CLASS} onClick={() => toggle("reject")} disabled={isSubmitting || !verifierCapId}>
            {verifierCapId ? "Reject Proof" : "Reject Proof (no VerifierCap)"}
          </button>
          {expandedAction === "reject" && verifierCapId && (
            <div className="grid gap-2 border border-red-500/20 p-2">
              <input className={INPUT_CLASS} placeholder="Hunter address" value={hunterAddr} onChange={(e) => setHunterAddr(e.target.value)} />
              <textarea className={INPUT_CLASS} placeholder="Rejection reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              <p className="text-[0.6rem] text-eve-muted text-right">{reason.length}/500</p>
              <button
                className={BTN_CLASS}
                disabled={isSubmitting || !reason || !hunterAddr}
                onClick={() => rejectProof({ hunter: hunterAddr, reason, verifierCapId })}
              >
                {isSubmitting ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Resolve Dispute */}
      {status === 4 && (
        <>
          <button className={BTN_CLASS} onClick={() => toggle("resolve")} disabled={isSubmitting}>
            Resolve Dispute
          </button>
          {expandedAction === "resolve" && (
            <div className="grid gap-2 border border-amber-400/20 p-2">
              <input className={INPUT_CLASS} placeholder="Hunter address" value={hunterAddr} onChange={(e) => setHunterAddr(e.target.value)} />
              <div className="flex gap-2">
                <button
                  className={`${BTN_CLASS} border-green-500/40 hover:border-green-500/80`}
                  disabled={isSubmitting || !hunterAddr}
                  onClick={() => resolveDispute({ hunter: hunterAddr, approve: true })}
                >
                  Approve
                </button>
                <button
                  className={`${BTN_CLASS} border-red-500/40 hover:border-red-500/80`}
                  disabled={isSubmitting || !hunterAddr}
                  onClick={() => resolveDispute({ hunter: hunterAddr, approve: false })}
                >
                  Deny
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
