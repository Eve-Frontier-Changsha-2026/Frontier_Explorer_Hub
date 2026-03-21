"use client";

import { useMemo, useState } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { subscriptionPlans } from "@/lib/mock-data";
import { ShellFrame } from "../shell-frame";

const coverageZones = [
  { id: "Z-A1", name: "Citadel Arc", free: "Delayed", premium: "Live" },
  { id: "Z-B4", name: "Refinery Spine", free: "Locked Depth", premium: "Deep Zoom" },
  { id: "Z-C8", name: "Outer Colony", free: "Basic Intel", premium: "Full Breakdown" },
  { id: "Z-D2", name: "Ancient Relay", free: "No Forecast", premium: "Predictive Alerts" },
];

export default function SubscribePage() {
  const { subscription, isPremium, isLoading } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "quarterly">("monthly");
  const [activeZone, setActiveZone] = useState<string>(coverageZones[0].id);

  const expiresText = useMemo(() => {
    if (!subscription) return "No expiry (basic access)";
    if (!subscription.expiresAt) return "N/A";
    return new Date(subscription.expiresAt).toLocaleString();
  }, [subscription]);

  const statusLabel = useMemo(() => {
    if (isPremium && subscription?.isActive) return "Active (Premium)";
    if (!subscription) return "Active (Basic)";
    if (!subscription.isActive) return "Expired";
    return "Standard";
  }, [isPremium, subscription]);

  const zone = coverageZones.find((item) => item.id === activeZone) ?? coverageZones[0];

  return (
    <ShellFrame
      title="MEMBERSHIP COMMAND"
      subtitle="Independent membership route. Access via /subscribe with tier status, plans, and capability matrix."
      theme="membership"
    >
      <div className="membership-layout">
        <section className="column">
          <article className="panel membership-hero">
            <div className="panel-title">
              <h2>Current Access Level</h2>
              <span>{isPremium ? "PREMIUM ACTIVE" : "FREE ACCESS"}</span>
            </div>
            <div className="membership-stats">
              <article className="stat-card">
                <strong>{isPremium ? "Premium" : "Free"}</strong>
                <p>Tier</p>
              </article>
              <article className="stat-card">
                <strong>{statusLabel}</strong>
                <p>Status</p>
              </article>
              <article className="stat-card">
                <strong>{expiresText}</strong>
                <p>Expiry</p>
              </article>
            </div>
            {isLoading ? <p className="hint">Syncing membership status from data API...</p> : null}
            {!isLoading && !subscription ? <p className="hint">No subscription record returned. You are currently treated as free tier.</p> : null}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Coverage Advantage Map</h2>
              <span>{zone.id}</span>
            </div>
            <div className="region-strip">
              {coverageZones.map((item) => (
                <button
                  key={item.id}
                  className={`region-chip ${activeZone === item.id ? "region-chip-active" : ""}`}
                  onClick={() => setActiveZone(item.id)}
                >
                  <strong>{item.id}</strong>
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <article className="region-focus">
              <div className="panel-title">
                <strong>{zone.name}</strong>
                <span>Feature Delta</span>
              </div>
              <p>Free: {zone.free} | Premium: {zone.premium}</p>
            </article>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Plan Selection</h2>
              <span>{subscriptionPlans.length}</span>
            </div>
            <div className="actions">
              <button
                className={`btn ${billingCycle === "monthly" ? "btn-active" : ""}`}
                onClick={() => setBillingCycle("monthly")}
              >
                Monthly Billing
              </button>
              <button
                className={`btn ${billingCycle === "quarterly" ? "btn-active" : ""}`}
                onClick={() => setBillingCycle("quarterly")}
              >
                Quarterly Billing
              </button>
            </div>
            <div className="grid-2">
              {subscriptionPlans.map((plan) => (
                <article key={plan.id} className={`plan-card ${plan.id === "premium" ? "plan-card-premium" : ""}`}>
                  <div className="panel-title">
                    <strong>{plan.title}</strong>
                    <span>{plan.id === "premium" && billingCycle === "quarterly" ? "81 SUI / 90d" : plan.price}</span>
                  </div>
                  <ul>
                    {plan.highlights.slice(0, 2).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="actions">
                    <button className={`btn ${plan.id === "premium" ? "btn-cta-premium" : ""}`}>
                      {plan.id === "premium" ? "Upgrade Membership" : "Current Base Tier"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>

        <aside className="membership-side membership-sticky">
          <article className="panel">
            <div className="panel-title">
              <h2>Billing Summary</h2>
              <span>Mock Ledger</span>
            </div>
            <div className="list">
              <article className="item">
                <div className="panel-title">
                  <strong>Current Cycle</strong>
                  <span>{billingCycle}</span>
                </div>
                <p>{isPremium ? "Premium charges will renew automatically unless canceled before expiry." : "No active paid membership."}</p>
              </article>
              <article className="item">
                <div className="panel-title">
                  <strong>Wallet Access</strong>
                  <span>{subscription?.nftId ? "Bound" : "Unbound"}</span>
                </div>
                <p>{subscription?.nftId ? `Subscription NFT: ${subscription.nftId}` : "Bind wallet after first premium activation."}</p>
              </article>
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Membership FAQ</h2>
              <span>Ops Notes</span>
            </div>
            <ul>
              <li>Downgrade takes effect after current premium period ends.</li>
              <li>Feature gates are applied in real-time at hook layer.</li>
              <li>Enterprise alliance plans can be added as custom tiers later.</li>
            </ul>
          </article>
        </aside>
      </div>

      <section className="panel membership-full">
        <div className="panel-title">
          <h2>Capability Matrix</h2>
          <span>Comparison Table</span>
        </div>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Free</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Heatmap Refresh</td>
                <td>60s</td>
                <td>10s</td>
              </tr>
              <tr>
                <td>Map Zoom Depth</td>
                <td>Level 1</td>
                <td>Level 2</td>
              </tr>
              <tr>
                <td>Intel Breakdown</td>
                <td>Basic</td>
                <td>Full</td>
              </tr>
              <tr>
                <td>Bounty Signal Priority</td>
                <td>Standard Queue</td>
                <td>Priority Queue</td>
              </tr>
              <tr>
                <td>Route Forecast</td>
                <td>-</td>
                <td>Enabled</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </ShellFrame>
  );
}
