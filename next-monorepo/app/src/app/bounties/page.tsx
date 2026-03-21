"use client";

import { useState } from "react";
import { useBounties } from "@/hooks/use-bounties";
import { ShellFrame } from "../shell-frame";

type LocalBounty = { id: string; target: string; reward: number; deadline: string };

export default function BountiesPage() {
  const { bounties, isLoading } = useBounties();
  const [target, setTarget] = useState("SYS-30007801");
  const [reward, setReward] = useState(50);
  const [deadline, setDeadline] = useState("72h");
  const [local, setLocal] = useState<LocalBounty[]>([]);

  const onCreate = () => {
    setLocal((prev) => [
      {
        id: `LOCAL-${prev.length + 1}`,
        target,
        reward,
        deadline
      },
      ...prev
    ]);
  };

  return (
    <ShellFrame
      title="BOUNTY COMMAND BOARD"
      subtitle="Create and track active operational bounties with payout-focused structure."
    >
      <div className="page-grid">
        <section className="column">
          <article className="panel">
            <div className="panel-title">
              <h2>Create Bounty</h2>
              <span>Mock Workflow</span>
            </div>
            <div className="grid-2">
              <div>
                <p className="hint">Target System</p>
                <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
              <div>
                <p className="hint">Reward (SUI)</p>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={reward}
                  onChange={(e) => setReward(Number(e.target.value))}
                />
              </div>
            </div>
            <p className="hint">Deadline</p>
            <select className="select" value={deadline} onChange={(e) => setDeadline(e.target.value)}>
              <option>24h</option>
              <option>48h</option>
              <option>72h</option>
              <option>7d</option>
            </select>
            <div className="actions">
              <button className="btn" onClick={onCreate}>
                Add Local Bounty
              </button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>On-chain Active Bounties</h2>
              <span>{isLoading ? "loading" : bounties.length}</span>
            </div>
            <div className="list">
              {isLoading ? <p className="hint">Loading bounties...</p> : null}
              {!isLoading && bounties.length === 0 ? <p className="hint">No active on-chain bounties returned.</p> : null}
              {bounties.map((bounty) => (
                <article key={bounty.id} className="item">
                  <div className="panel-title">
                    <strong>{bounty.id}</strong>
                    <span>Status {bounty.status}</span>
                  </div>
                  <p>Reward: {bounty.rewardAmount}</p>
                  <p>Submissions: {bounty.submissionCount}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        <aside className="side">
          <article className="panel">
            <div className="panel-title">
              <h2>Local Board</h2>
              <span>{local.length}</span>
            </div>
            <div className="list scroll">
              {local.length === 0 ? <p className="hint">No local bounty drafts.</p> : null}
              {local.map((bounty) => (
                <article key={bounty.id} className="item">
                  <div className="panel-title">
                    <strong>{bounty.id}</strong>
                    <span>{bounty.deadline}</span>
                  </div>
                  <p>Target: {bounty.target}</p>
                  <p>Reward: {bounty.reward} SUI</p>
                </article>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </ShellFrame>
  );
}
