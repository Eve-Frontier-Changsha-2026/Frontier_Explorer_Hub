"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { usePortalStore } from "@/stores/portal-store";
import { PortalLinkList } from "@/components/portal/PortalLinkList";
import { PortalPreview } from "@/components/portal/PortalPreview";
import { PortalEmptyState } from "@/components/portal/PortalEmptyState";

export default function PortalPage() {
  const links = usePortalStore((s) => s.links);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first link on mount or when selection becomes invalid
  useEffect(() => {
    if (links.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !links.some((l) => l.id === selectedId)) {
      setSelectedId(links[0].id);
    }
  }, [links, selectedId]);

  const selectedLink = links.find((l) => l.id === selectedId);

  return (
    <>
      <PageHeader
        title="PORTAL"
        subtitle="Your external tools and dashboards, embedded in one place."
        variant="portal"
      />

      {links.length === 0 ? (
        <Panel title="Portal Links" className="mt-3">
          <PortalEmptyState />
        </Panel>
      ) : (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 max-lg:grid-cols-1">
          <Panel title="Links" badge={`${links.length}`}>
            <div className="mt-2">
              <PortalLinkList selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </Panel>

          <Panel title="Preview" badge={selectedLink?.name ?? "none"} className="min-h-[500px]">
            {selectedLink ? (
              <div className="mt-2 h-[calc(100%-1.5rem)]">
                <PortalPreview
                  url={selectedLink.url}
                  name={selectedLink.name}
                  linkId={selectedLink.id}
                />
              </div>
            ) : (
              <p className="mt-2 text-[0.73rem] text-eve-muted/80">Select a link to preview.</p>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
