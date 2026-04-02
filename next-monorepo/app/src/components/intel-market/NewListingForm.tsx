"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useListIntel, useSetEncryptedPayload } from "@/hooks/use-intel-market";
import { INTEL_TYPE_LABELS, EXPIRY_OPTIONS_V2, MIN_LISTING_FEE_MIST } from "@/lib/constants";

export function NewListingForm() {
  const account = useCurrentAccount();
  const listIntel = useListIntel();
  const sealPayload = useSetEncryptedPayload();

  const [title, setTitle] = useState("");
  const [regionId, setRegionId] = useState(0);
  const [sectorX, setSectorX] = useState(0);
  const [sectorY, setSectorY] = useState(0);
  const [sectorZ, setSectorZ] = useState(0);
  const [intelType, setIntelType] = useState(0);
  const [severity, setSeverity] = useState(5);
  const [expiryOffset, setExpiryOffset] = useState(EXPIRY_OPTIONS_V2[2].ms);
  const [priceSui, setPriceSui] = useState("");

  // Encrypted layer
  const [exactX, setExactX] = useState("");
  const [exactY, setExactY] = useState("");
  const [exactZ, setExactZ] = useState("");
  const [description, setDescription] = useState("");

  const [status, setStatus] = useState<"idle" | "listing" | "encrypting" | "done">("idle");

  const handleSubmit = async () => {
    if (!account) return;
    setStatus("listing");
    try {
      const priceMist = Math.floor(parseFloat(priceSui) * 1_000_000_000);
      // TX1: create listing on-chain
      const newListingId = await listIntel.mutateAsync({
        title,
        regionId,
        sectorX,
        sectorY,
        sectorZ,
        intelType,
        severity,
        expiryMs: Date.now() + expiryOffset,
        priceMist,
        feeMist: MIN_LISTING_FEE_MIST,
      });

      // TX2: encrypt & seal — skip if no encrypted content
      const hasEncrypted = exactX || exactY || exactZ || description;
      if (hasEncrypted) {
        setStatus("encrypting");
        const plaintext = JSON.stringify({
          exactCoords: { x: exactX, y: exactY, z: exactZ },
          description,
        });
        const encrypted = new TextEncoder().encode(plaintext); // placeholder until Seal integration
        await sealPayload.mutateAsync({
          listingId: newListingId,
          encryptedBytes: encrypted,
        });
      }
      setStatus("done");
    } catch {
      setStatus("idle");
    }
  };

  const isPending = status === "listing" || status === "encrypting";
  const inputClass = "w-full border border-eve-panel-border bg-[rgba(12,16,24,0.95)] text-eve-text font-mono text-xs px-2 py-1.5";

  return (
    <div className="border border-eve-panel-border p-3 bg-eve-panel sticky top-4">
      <div className="text-sm tracking-wide uppercase text-eve-cold mb-2">
        New Listing {status === "done" && "— Listed ✓"}
      </div>

      {status !== "done" && (
        <>
          {/* Title */}
          <input
            type="text"
            placeholder='Title: "High-value wreckage field..."'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} mb-2`}
            maxLength={256}
          />

          {/* Public layer */}
          <div className="border border-eve-panel-border/40 p-2 mb-2">
            <div className="text-[0.6rem] text-eve-cold mb-1.5">▸ PUBLIC (visible to all)</div>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="number" placeholder="Region ID" value={regionId || ""} onChange={(e) => setRegionId(Number(e.target.value))} className={inputClass} />
              <select value={intelType} onChange={(e) => setIntelType(Number(e.target.value))} className={inputClass}>
                {Object.entries(INTEL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              <input type="number" placeholder="Sector X" value={sectorX || ""} onChange={(e) => setSectorX(Number(e.target.value))} className={inputClass} />
              <input type="number" placeholder="Sector Y" value={sectorY || ""} onChange={(e) => setSectorY(Number(e.target.value))} className={inputClass} />
              <input type="number" placeholder="Sector Z" value={sectorZ || ""} onChange={(e) => setSectorZ(Number(e.target.value))} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <div>
                <label className="text-[0.55rem] text-eve-muted">Severity: {severity}/10</label>
                <input type="range" min={0} max={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="w-full" />
              </div>
              <select value={expiryOffset} onChange={(e) => setExpiryOffset(Number(e.target.value))} className={inputClass}>
                {EXPIRY_OPTIONS_V2.map((o) => <option key={o.ms} value={o.ms}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Encrypted layer */}
          <div className="border border-eve-gold/20 p-2 mb-2">
            <div className="text-[0.6rem] text-eve-gold mb-1.5">🔒 ENCRYPTED (buyers only)</div>
            <div className="grid grid-cols-3 gap-1.5">
              <input type="text" placeholder="Exact X" value={exactX} onChange={(e) => setExactX(e.target.value)} className={`${inputClass} border-eve-gold/20`} />
              <input type="text" placeholder="Exact Y" value={exactY} onChange={(e) => setExactY(e.target.value)} className={`${inputClass} border-eve-gold/20`} />
              <input type="text" placeholder="Exact Z" value={exactZ} onChange={(e) => setExactZ(e.target.value)} className={`${inputClass} border-eve-gold/20`} />
            </div>
            <textarea
              placeholder="Detailed intel description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputClass} border-eve-gold/20 mt-1.5 min-h-[60px] resize-none`}
            />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <input type="number" placeholder="Price (SUI)" step="0.01" value={priceSui} onChange={(e) => setPriceSui(e.target.value)} className={`${inputClass} text-eve-gold`} />
            <div className={`${inputClass} text-eve-muted`}>Fee: 0.01 SUI</div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!account || isPending || !title || !priceSui}
            className="w-full border border-eve-gold/40 text-eve-gold py-1.5 text-xs hover:bg-eve-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "listing" ? "Creating listing..." : status === "encrypting" ? "Encrypting & sealing..." : "⬆ LIST INTEL"}
          </button>
        </>
      )}

      {status === "done" && (
        <div className="text-xs text-eve-safe text-center py-4">
          Intel listed and sealed successfully.
          <button onClick={() => setStatus("idle")} className="block mx-auto mt-2 text-eve-cold hover:text-eve-text underline">
            List another
          </button>
        </div>
      )}
    </div>
  );
}
