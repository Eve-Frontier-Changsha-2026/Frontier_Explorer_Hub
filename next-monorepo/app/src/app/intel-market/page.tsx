"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { IntelListingBrowser } from "@/components/intel-market/IntelListingBrowser";
import { NewListingForm } from "@/components/intel-market/NewListingForm";
import { IntelRequestBrowser } from "@/components/intel-market/IntelRequestBrowser";
import { PostRequestForm } from "@/components/intel-market/PostRequestForm";
import { FulfillRequestForm } from "@/components/intel-market/FulfillRequestForm";
import { MyActivity } from "@/components/intel-market/MyActivity";

type Tab = "sell" | "bounty" | "activity";

export default function IntelMarketPage() {
  const [activeTab, setActiveTab] = useState<Tab>("sell");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: "sell", label: "SELL INTEL" },
    { key: "bounty", label: "BOUNTY BOARD" },
    { key: "activity", label: "MY ACTIVITY" },
  ];

  return (
    <div className="max-w-[1300px] mx-auto p-4">
      <PageHeader
        title="INTEL MARKET"
        subtitle="Trade encrypted intelligence. Buy verified intel. Build your reputation."
      />

      {/* Sub-tabs */}
      <div className="flex gap-0 border-b border-eve-panel-border mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-xs font-mono tracking-wide transition-colors ${
              activeTab === tab.key
                ? "text-eve-gold border-b-2 border-eve-gold -mb-[1px]"
                : "text-eve-muted hover:text-eve-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "sell" && (
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
          <IntelListingBrowser />
          <div className="content-start sticky top-4">
            <NewListingForm />
          </div>
        </div>
      )}

      {activeTab === "bounty" && (
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)] gap-3 max-lg:grid-cols-1">
          <IntelRequestBrowser
            selectedRequestId={selectedRequestId}
            onSelectRequest={setSelectedRequestId}
          />
          <div className="content-start sticky top-4">
            {selectedRequestId ? (
              <FulfillRequestForm
                requestId={selectedRequestId}
                onCancel={() => setSelectedRequestId(null)}
                onSuccess={() => setSelectedRequestId(null)}
              />
            ) : (
              <PostRequestForm />
            )}
          </div>
        </div>
      )}

      {activeTab === "activity" && <MyActivity />}
    </div>
  );
}
