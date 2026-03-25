"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { validatePortalUrl } from "@/lib/portal-url";
import { usePortalStore } from "@/stores/portal-store";
import { PortalFullscreenBar } from "@/components/portal/PortalFullscreenBar";

function PortalViewContent() {
  const params = useSearchParams();
  const router = useRouter();
  const addLink = usePortalStore((s) => s.addLink);

  const url = params.get("url");
  const name = params.get("name") || "Untitled";

  if (!url) {
    router.replace("/portal");
    return null;
  }

  const validation = validatePortalUrl(url);
  if (!validation.valid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-eve-panel">
        <p className="text-sm text-eve-danger">Invalid URL</p>
        <p className="text-xs text-eve-muted">{validation.error}</p>
        <button
          onClick={() => router.push("/portal")}
          className="text-xs border border-eve-panel-border text-eve-muted px-3 py-1.5 cursor-pointer hover:text-eve-text"
        >
          ← Back to Portal
        </button>
      </div>
    );
  }

  const handleAddToPortal = () => {
    const id = addLink(name, url);
    if (id) {
      router.push(`/portal/${id}`);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-eve-panel">
      <PortalFullscreenBar name={name} url={url} onAddToPortal={handleAddToPortal} />
      <iframe
        src={url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className="flex-1 w-full border-0"
        title={name}
      />
    </div>
  );
}

export default function PortalViewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-eve-panel" />}>
      <PortalViewContent />
    </Suspense>
  );
}
