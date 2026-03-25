"use client";

import Link from "next/link";

interface PortalFullscreenBarProps {
  name: string;
  url: string;
  onAddToPortal?: () => void;
}

export function PortalFullscreenBar({ name, url, onAddToPortal }: PortalFullscreenBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-eve-panel-border bg-eve-panel">
      <Link
        href="/portal"
        className="text-eve-muted hover:text-eve-text text-xs border border-eve-panel-border px-2 py-1"
      >
        ← Back
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-eve-cold truncate">{name}</p>
        <p className="text-[0.66rem] text-eve-muted truncate">{url}</p>
      </div>
      {onAddToPortal && (
        <button
          onClick={onAddToPortal}
          className="text-xs border border-eve-gold/60 text-eve-gold px-2.5 py-1 cursor-pointer hover:bg-eve-gold/10"
        >
          + Add to Portal
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs border border-eve-panel-border text-eve-muted px-2.5 py-1 hover:text-eve-text"
      >
        Open in Tab ↗
      </a>
    </div>
  );
}
