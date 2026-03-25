"use client";

import { useState } from "react";
import { usePortalStore } from "@/stores/portal-store";
import { AddLinkDialog } from "./AddLinkDialog";

interface PortalLinkListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PortalLinkList({ selectedId, onSelect }: PortalLinkListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const links = usePortalStore((s) => s.links);
  const removeLink = usePortalStore((s) => s.removeLink);
  const reorderLinks = usePortalStore((s) => s.reorderLinks);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const ids = links.map((l) => l.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderLinks(ids);
  };

  const moveDown = (index: number) => {
    if (index >= links.length - 1) return;
    const ids = links.map((l) => l.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    reorderLinks(ids);
  };

  const extractDomain = (url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  };

  return (
    <div className="flex flex-col gap-2">
      {links.length >= 20 && (
        <p className="text-[0.66rem] text-eve-warn px-1">You have 20+ links. Consider cleaning up unused ones.</p>
      )}
      <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
        {links.map((link, i) => (
          <div
            key={link.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(link.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(link.id); }}
            className={`group flex items-center gap-2 px-2.5 py-2 text-left w-full cursor-pointer border transition-all ${
              selectedId === link.id
                ? "border-eve-glow bg-[rgba(14,21,31,0.84)]"
                : "border-transparent hover:border-eve-panel-border/40 hover:bg-[rgba(8,11,16,0.6)]"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-eve-text truncate">{link.name}</p>
              <p className="text-[0.66rem] text-eve-muted truncate">{extractDomain(link.url)}</p>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); moveUp(i); }}
                className="text-eve-muted hover:text-eve-text text-[0.7rem] px-1"
                title="Move up"
              >↑</button>
              <button
                onClick={(e) => { e.stopPropagation(); moveDown(i); }}
                className="text-eve-muted hover:text-eve-text text-[0.7rem] px-1"
                title="Move down"
              >↓</button>
              <button
                onClick={(e) => { e.stopPropagation(); removeLink(link.id); }}
                className="text-eve-muted hover:text-eve-danger text-[0.7rem] px-1"
                title="Delete"
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {showAdd ? (
        <AddLinkDialog
          onClose={() => setShowAdd(false)}
          onAdded={(id) => onSelect(id)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full border border-dashed border-eve-panel-border text-eve-muted hover:text-eve-text hover:border-eve-info/40 text-xs py-2 cursor-pointer"
        >
          + Add Link
        </button>
      )}
    </div>
  );
}
