"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { getBountyDetail } from "@/lib/api-client";
import {
  buildSubmitIntelProof,
  buildResubmitIntelProof,
  buildRejectProof,
  buildDisputeRejection,
  buildResolveDispute,
  buildAutoApproveProof,
} from "@/lib/ptb/bounty";
import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "./use-auth";
import { CLOCK_ID, REVIEW_PERIOD_MS, BOUNTY_ESCROW_PACKAGE_ID } from "@/lib/constants";
import type { BountyRole } from "@/types";

export function useBountyDetail(bountyId: string) {
  const { isAuthenticated } = useAuth();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const addToast = useUIStore((s) => s.addToast);
  const setPendingTx = useUIStore((s) => s.setPendingTx);

  const query = useQuery({
    queryKey: ["bounty", bountyId],
    queryFn: () => getBountyDetail(bountyId),
    enabled: isAuthenticated && !!bountyId,
    staleTime: 15_000,
  });

  const bounty = query.data?.bounty ?? null;
  const walletAddress = account?.address ?? "";

  // Derived: role
  const role: BountyRole = (() => {
    if (!bounty || !walletAddress) return "viewer";
    if (bounty.requester === walletAddress) return "creator";
    if (bounty.events.some((e) => e.hunter === walletAddress)) return "hunter";
    return "viewer";
  })();

  // Derived: current proof status
  const currentProofStatus = (() => {
    if (!bounty) return null;
    const hunterEvents = bounty.events.filter((e) => e.hunter === walletAddress);
    if (hunterEvents.length === 0) return null;
    return hunterEvents[hunterEvents.length - 1]!.eventType;
  })();

  // Derived: VerifierCap for creator role
  const verifierCapQuery = useQuery({
    queryKey: ["verifier-cap", walletAddress, bountyId],
    queryFn: async () => {
      if (!account) return null;
      const { data } = await suiClient.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: `${BOUNTY_ESCROW_PACKAGE_ID}::verifier::VerifierCap` },
        options: { showContent: true },
      });
      const cap = data.find((obj) => {
        const fields = (obj.data?.content as { fields: Record<string, unknown> })?.fields;
        return fields?.['bounty_id'] === bountyId;
      });
      return cap?.data?.objectId ?? null;
    },
    enabled: role === "creator" && !!walletAddress,
    staleTime: 60_000,
  });
  const verifierCapId = verifierCapQuery.data ?? null;

  // Derived: review deadline
  const reviewDeadline = (() => {
    if (!bounty) return null;
    const submitEvents = bounty.events.filter(
      (e) => e.eventType === "proof_submitted" || e.eventType === "proof_resubmitted",
    );
    if (submitEvents.length === 0) return null;
    const latest = submitEvents[submitEvents.length - 1]!;
    return latest.timestamp + REVIEW_PERIOD_MS;
  })();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bounty", bountyId] });
    queryClient.invalidateQueries({ queryKey: ["bounties"] });
  };

  function makeMutation<P>(
    buildFn: (tx: Transaction, params: P) => Transaction,
    successMsg: string,
  ) {
    return useMutation({
      mutationFn: async (params: P) => {
        const tx = new Transaction();
        buildFn(tx, params);
        const result = await signAndExecute({ transaction: tx as never });
        setPendingTx(result.digest);
        return result;
      },
      onSuccess: (result) => {
        invalidate();
        addToast({ type: "success", message: `${successMsg} — ${result.digest.slice(0, 16)}...` });
        setPendingTx(null);
      },
      onError: (err) => {
        addToast({ type: "error", message: `Failed: ${String((err as Error).message ?? err)}` });
        setPendingTx(null);
      },
    });
  }

  const submitProof = makeMutation(
    (tx, p: { metaId: string; intelId: string; proofUrl: string; proofDescription: string }) =>
      buildSubmitIntelProof(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Proof submitted",
  );
  const resubmitProof = makeMutation(
    (tx, p: { metaId: string; intelId: string; proofUrl: string; proofDescription: string }) =>
      buildResubmitIntelProof(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Proof resubmitted",
  );
  const rejectProof = makeMutation(
    (tx, p: { hunter: string; reason: string; verifierCapId: string }) =>
      buildRejectProof(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Proof rejected",
  );
  const disputeRejection = makeMutation(
    (tx, p: { reason: string }) =>
      buildDisputeRejection(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Dispute filed",
  );
  const resolveDispute = makeMutation(
    (tx, p: { hunter: string; approve: boolean }) =>
      buildResolveDispute(tx, { ...p, bountyId, clockId: CLOCK_ID }),
    "Dispute resolved",
  );
  const autoApproveProof = makeMutation(
    (tx, _p: Record<string, never>) =>
      buildAutoApproveProof(tx, { bountyId, clockId: CLOCK_ID }),
    "Proof auto-approved",
  );

  return {
    bounty,
    isLoading: query.isLoading,
    role,
    currentProofStatus,
    reviewDeadline,
    verifierCapId,
    submitProof: submitProof.mutateAsync,
    resubmitProof: resubmitProof.mutateAsync,
    rejectProof: rejectProof.mutateAsync,
    disputeRejection: disputeRejection.mutateAsync,
    resolveDispute: resolveDispute.mutateAsync,
    autoApproveProof: autoApproveProof.mutateAsync,
    isSubmitting: submitProof.isPending || resubmitProof.isPending || rejectProof.isPending
      || disputeRejection.isPending || resolveDispute.isPending || autoApproveProof.isPending,
  };
}
