"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePortalStore } from "@/stores/portal-store";
import { useUIStore } from "@/stores/ui-store";
import { PortalFullscreenBar } from "@/components/portal/PortalFullscreenBar";

export default function PortalFullscreenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const getLinkById = usePortalStore((s) => s.getLinkById);
  const addToast = useUIStore((s) => s.addToast);
  const link = getLinkById(id);

  useEffect(() => {
    if (!link) {
      addToast({ type: "warning", message: "Portal link not found" });
      router.replace("/portal");
    }
  }, [link, router, addToast]);

  if (!link) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-eve-panel">
      <PortalFullscreenBar name={link.name} url={link.url} />
      <iframe
        src={link.url}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className="flex-1 w-full border-0"
        title={link.name}
      />
    </div>
  );
}
