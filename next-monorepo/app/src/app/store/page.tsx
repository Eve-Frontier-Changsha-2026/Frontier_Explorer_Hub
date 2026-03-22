"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { plugins } from "@/lib/mock-data";

type PluginCategory = "Intel" | "Economy" | "Signals";

const CATEGORY_MAP: Record<string, PluginCategory> = {
  trace: "Intel",
  auction: "Economy",
  civil: "Intel",
  relay: "Signals",
};

const PRICE_MAP: Record<string, string> = {
  trace: "12 SUI / 30d",
  auction: "9 SUI / 30d",
  civil: "7 SUI / 30d",
  relay: "15 SUI / 30d",
};

const INITIAL_SLOTS = [
  { id: "S1", label: "Tactical Core", role: "Intel Only", pluginId: null as string | null },
  { id: "S2", label: "Economic Engine", role: "Economy Only", pluginId: null as string | null },
  { id: "S3", label: "Signal Bay", role: "Signals Only", pluginId: null as string | null },
  { id: "S4", label: "Auxiliary Dock", role: "Flexible", pluginId: null as string | null },
];

export default function StorePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | PluginCategory>("All");
  const [selected, setSelected] = useState(plugins[0]?.id ?? "");
  const [slots, setSlots] = useState(INITIAL_SLOTS);
  const [activeSlotId, setActiveSlotId] = useState(INITIAL_SLOTS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((p) => {
      const cat = CATEGORY_MAP[p.id];
      if (activeCategory !== "All" && cat !== activeCategory) return false;
      if (q && !p.label.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, activeCategory]);

  const selectedPlugin = plugins.find((p) => p.id === selected) ?? null;
  const activeSlot = slots.find((s) => s.id === activeSlotId) ?? slots[0];

  const canEquip = (() => {
    if (!selectedPlugin) return false;
    const cat = CATEGORY_MAP[selectedPlugin.id];
    if (activeSlot.role === "Flexible") return true;
    if (activeSlot.role === "Intel Only") return cat === "Intel";
    if (activeSlot.role === "Economy Only") return cat === "Economy";
    if (activeSlot.role === "Signals Only") return cat === "Signals";
    return false;
  })();

  const equipToSlot = () => {
    if (!selectedPlugin || !canEquip) return;
    setSlots((prev) => prev.map((s) => (s.id === activeSlot.id ? { ...s, pluginId: selectedPlugin.id } : s)));
  };

  const clearSlot = () => {
    setSlots((prev) => prev.map((s) => (s.id === activeSlot.id ? { ...s, pluginId: null } : s)));
  };

  return (
    <>
      <PageHeader
        title="PLUGIN MARKETPLACE"
        subtitle="Plugin catalog with category filters, preview, and multi-slot loadout system."
        variant="store"
      />

      <div className="mt-3 grid grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)] gap-3 max-lg:grid-cols-1">
        <div className="grid gap-3">
          {/* Filters */}
          <Panel title="Catalog Filters" badge={`${plugins.length} modules`}>
            <div className="mt-2 grid gap-2">
              <input
                className="w-full border border-eve-info/60 bg-[rgba(20,28,41,0.96)] text-eve-text font-mono text-xs px-2.5 py-2 placeholder:text-eve-muted/60"
                placeholder="Search plugin..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                {(["All", "Intel", "Economy", "Signals"] as const).map((cat) => (
                  <button
                    key={cat}
                    className={`border px-2.5 py-1.5 text-xs uppercase tracking-wide cursor-pointer ${
                      activeCategory === cat
                        ? "border-eve-gold/60 text-eve-gold"
                        : "border-eve-panel-border text-eve-muted hover:text-eve-text"
                    }`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* Plugin Catalog */}
          <Panel title="Plugin Catalog" badge={`${filtered.length} results`}>
            <div className="mt-2 grid gap-2 max-h-96 overflow-y-auto">
              {filtered.map((plugin) => {
                const cat = CATEGORY_MAP[plugin.id];
                const isSelected = selected === plugin.id;
                return (
                  <button
                    key={plugin.id}
                    className={`border p-2 text-left w-full cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? "border-eve-glow bg-[rgba(14,21,31,0.84)] shadow-[inset_0_0_0_1px_rgba(122,176,227,0.3)]"
                        : "border-eve-panel-border/40 bg-[rgba(8,11,16,0.84)] hover:border-eve-panel-border hover:-translate-y-px"
                    }`}
                    onClick={() => setSelected(plugin.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs">{plugin.label}</strong>
                      <span className="text-[0.66rem] text-eve-muted">{cat}</span>
                    </div>
                    <p className="mt-1 text-[0.73rem] text-eve-muted/80">{plugin.description}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{plugin.effect}</span>
                      <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{PRICE_MAP[plugin.id]}</span>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-[0.73rem] text-eve-muted/80">No plugins matched filters.</p>}
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 content-start">
          {/* Preview */}
          <Panel title="Plugin Preview" badge={selectedPlugin?.id.toUpperCase() ?? "none"}>
            {selectedPlugin ? (
              <>
                <h3 className="mt-2 text-base text-eve-cold">{selectedPlugin.label}</h3>
                <p className="mt-1 text-[0.73rem] text-eve-muted/80">{selectedPlugin.description}</p>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{CATEGORY_MAP[selectedPlugin.id]}</span>
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{selectedPlugin.effect}</span>
                  <span className="border border-eve-panel-border text-eve-muted text-[0.63rem] px-1 py-0.5">{PRICE_MAP[selectedPlugin.id]}</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[0.73rem] text-eve-muted/80">Select a plugin to inspect.</p>
            )}
          </Panel>

          {/* Loadout Slots */}
          <Panel title="Loadout Slots" badge={`${slots.filter((s) => s.pluginId).length} / ${slots.length}`}>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {slots.map((slot) => {
                const plugged = plugins.find((p) => p.id === slot.pluginId);
                const isActive = slot.id === activeSlotId;
                return (
                  <button
                    key={slot.id}
                    className={`border p-2.5 text-left cursor-pointer transition-all min-h-[100px] ${
                      plugged
                        ? "border-eve-gold/60 bg-gradient-to-b from-[rgba(22,20,17,0.86)] to-[rgba(13,11,9,0.9)] border-solid"
                        : "border-eve-panel-border/40 bg-gradient-to-b from-[rgba(12,18,26,0.9)] to-[rgba(8,11,16,0.92)] border-dashed"
                    } ${isActive ? "border-eve-glow shadow-[inset_0_0_0_1px_rgba(122,176,227,0.35)]" : ""}`}
                    onClick={() => setActiveSlotId(slot.id)}
                  >
                    <div className="flex justify-between items-center">
                      <strong className="text-sm text-eve-cold">{slot.id}</strong>
                      <span className="text-[0.66rem] text-eve-muted">{slot.role}</span>
                    </div>
                    <p className="text-[0.67rem] text-eve-info mt-1">{slot.label}</p>
                    <p className="mt-1 text-[0.73rem] text-eve-muted/80">
                      {plugged ? plugged.label : `[Empty] ${slot.id}`}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Slot Control */}
            <div className="mt-2 border border-eve-panel-border/50 bg-[rgba(8,11,16,0.84)] p-2">
              <div className="flex justify-between">
                <strong className="text-xs">{activeSlot.id} Control</strong>
                <span className="text-[0.66rem] text-eve-muted">{activeSlot.role}</span>
              </div>
              {!canEquip && selectedPlugin && (
                <p className="mt-1 text-[0.66rem] text-eve-warn">Category mismatch for this slot.</p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="border border-eve-gold/60 text-eve-gold text-xs px-3 py-1.5 uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={equipToSlot}
                  disabled={!selectedPlugin || !canEquip}
                >
                  Equip to {activeSlot.id}
                </button>
                <button
                  className="border border-eve-panel-border text-eve-muted text-xs px-3 py-1.5 uppercase cursor-pointer hover:text-eve-text"
                  onClick={clearSlot}
                >
                  Clear
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
