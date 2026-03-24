"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { ClaimTicketList } from "@/components/bounty/ClaimTicketList";
import { ProofTimeline } from "@/components/bounty/ProofTimeline";
import { ActionPanel } from "@/components/bounty/ActionPanel";
import { CountdownTimer } from "@/components/bounty/CountdownTimer";
import { useBountyDetail } from "@/hooks/use-bounty-detail";
import { BOUNTY_STATUS_LABELS, INTEL_TYPE_LABELS } from "@/lib/constants";

export default function BountyDetailPage() {
  const params = useParams<{ id: string }>();
  const bountyId = params.id;
  const account = useCurrentAccount();

  const {
    bounty, isLoading, role, currentProofStatus, reviewDeadline,
    verifierCapId, submitProof, resubmitProof, rejectProof,
    disputeRejection, resolveDispute, autoApproveProof, isSubmitting,
  } = useBountyDetail(bountyId);

  return (
    <>
      <PageHeader
        title="BOUNTY DETAIL"
        subtitle={`Viewing bounty ${bountyId.slice(0, 16)}...`}
        metrics={[
          { label: "Role", value: role.toUpperCase() },
          { label: "Status", value: bounty ? (BOUNTY_STATUS_LABELS[bounty.status] ?? "Unknown") : "---" },
          { label: "Wallet", value: account ? "Connected" : "---" },
        ]}
      />

      <div className="mt-2">
        <Link
          href="/bounties"
          className="text-xs text-eve-muted hover:text-eve-cyan"
        >
          ← Back to Bounty Board
        </Link>
      </div>

      {isLoading && (
        <div className="mt-3 grid gap-3">
          <div className="border border-eve-panel-border bg-eve-panel p-3 h-32 animate-pulse" />
          <div className="border border-eve-panel-border bg-eve-panel p-3 h-48 animate-pulse" />
        </div>
      )}

      {!isLoading && !bounty && (
        <Panel title="Error" className="mt-3">
          <p className="mt-2 text-[0.73rem] text-red-400">Bounty not found or failed to load.</p>
        </Panel>
      )}

      {bounty && (
        <div className="mt-3 grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
          {/* Left column */}
          <div className="grid gap-3 content-start">
            <Panel title="Bounty Info" badge={bountyId.slice(0, 16)}>
              <div className="mt-2 flex items-center gap-2">
                <StatusChip
                  label={BOUNTY_STATUS_LABELS[bounty.status] ?? "Unknown"}
                  active={bounty.status === 2 || bounty.status === 4}
                />
                <RiskBadge severity={bounty.rewardAmount > 5_000_000_000 ? 8 : 4} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[0.66rem] text-eve-muted">Region</p>
                  <p className="font-mono">
                    R{bounty.targetRegion.regionId} ({bounty.targetRegion.sectorX}, {bounty.targetRegion.sectorY}, {bounty.targetRegion.sectorZ})
                  </p>
                </div>
                <div>
                  <p className="text-[0.66rem] text-eve-muted">Intel Types</p>
                  <p className="font-mono">
                    {bounty.intelTypesWanted.map((t) => INTEL_TYPE_LABELS[t] ?? t).join(", ")}
                  </p>
                </div>
                <div>
                  <p className="text-[0.66rem] text-eve-muted">Reward</p>
                  <p className="font-mono text-eve-gold">
                    {(bounty.rewardAmount / 1_000_000_000).toFixed(2)} SUI
                  </p>
                </div>
                <div>
                  <p className="text-[0.66rem] text-eve-muted">Deadline</p>
                  <CountdownTimer targetMs={bounty.deadline} />
                </div>
                <div>
                  <p className="text-[0.66rem] text-eve-muted">Creator</p>
                  <p className="font-mono truncate">{bounty.creator.slice(0, 16)}...</p>
                </div>
                <div>
                  <p className="text-[0.66rem] text-eve-muted">Submissions</p>
                  <p className="font-mono">{bounty.submissionCount}</p>
                </div>
              </div>
            </Panel>

            <Panel title="Activity">
              <ProofTimeline events={bounty.events} reviewDeadline={reviewDeadline} />
              {bounty.events.length === 0 && (
                <p className="mt-2 text-[0.73rem] text-eve-muted/80">No proof activity yet.</p>
              )}
            </Panel>
          </div>

          {/* Right column */}
          <div className="grid gap-3 content-start">
            <Panel title="Hunters" badge={String(bounty.hunters.length)}>
              <ClaimTicketList hunters={bounty.hunters} currentAddress={account?.address} />
              {bounty.hunters.length === 0 && (
                <p className="mt-2 text-[0.73rem] text-eve-muted/80">No claim tickets yet.</p>
              )}
            </Panel>

            <Panel title="Actions" badge={role.toUpperCase()}>
              <ActionPanel
                role={role}
                bountyId={bountyId}
                metaId={bounty.metaId}
                status={bounty.status}
                currentProofStatus={currentProofStatus}
                reviewDeadline={reviewDeadline}
                verifierCapId={verifierCapId}
                submitProof={submitProof}
                resubmitProof={resubmitProof}
                rejectProof={rejectProof}
                disputeRejection={disputeRejection}
                resolveDispute={resolveDispute}
                autoApproveProof={autoApproveProof}
                isSubmitting={isSubmitting}
              />
              {role === "viewer" && (
                <p className="mt-2 text-[0.73rem] text-eve-muted/80">Connect wallet to interact.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
