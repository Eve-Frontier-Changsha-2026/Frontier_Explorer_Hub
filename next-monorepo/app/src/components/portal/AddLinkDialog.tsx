"use client";

import { useState } from "react";
import { validatePortalUrl } from "@/lib/portal-url";
import { usePortalStore } from "@/stores/portal-store";

interface AddLinkDialogProps {
  onClose: () => void;
  onAdded?: (id: string) => void;
}

export function AddLinkDialog({ onClose, onAdded }: AddLinkDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const addLink = usePortalStore((s) => s.addLink);
  const findByUrl = usePortalStore((s) => s.findByUrl);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) { setError("Name is required"); return; }

    const validation = validatePortalUrl(trimmedUrl);
    if (!validation.valid) { setError(validation.error); return; }

    const existing = findByUrl(trimmedUrl);
    if (existing) { setError(`URL already exists as "${existing.name}"`); return; }

    const id = addLink(trimmedName, trimmedUrl);
    if (id) {
      onAdded?.(id);
      onClose();
    }
  };

  return (
    <div className="border border-eve-info/40 bg-[rgba(14,21,31,0.95)] p-3 animate-slide-in">
      <h3 className="text-xs uppercase tracking-wide text-eve-cold mb-2">Add Portal Link</h3>
      <div className="grid gap-2">
        <input
          className="w-full border border-eve-panel-border bg-[rgba(20,28,41,0.96)] text-eve-text font-mono text-xs px-2.5 py-2 placeholder:text-eve-muted/60"
          placeholder="Link name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          autoFocus
        />
        <input
          className="w-full border border-eve-panel-border bg-[rgba(20,28,41,0.96)] text-eve-text font-mono text-xs px-2.5 py-2 placeholder:text-eve-muted/60"
          placeholder="https://..."
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); }}
        />
        {error && <p className="text-[0.7rem] text-eve-danger">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-xs border border-eve-panel-border text-eve-muted px-3 py-1.5 cursor-pointer hover:text-eve-text"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="text-xs border border-eve-gold/60 text-eve-gold px-3 py-1.5 cursor-pointer hover:bg-eve-gold/10"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
