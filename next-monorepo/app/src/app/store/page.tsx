"use client";

import { useMemo, useState } from "react";
import { plugins } from "@/lib/mock-data";
import { ShellFrame } from "../shell-frame";

type PluginCategory = "Intel" | "Economy" | "Signals";

const categoryById: Record<string, PluginCategory> = {
  trace: "Intel",
  auction: "Economy",
  civil: "Intel",
  relay: "Signals",
};

const priceById: Record<string, string> = {
  trace: "12 SUI / 30d",
  auction: "9 SUI / 30d",
  civil: "7 SUI / 30d",
  relay: "15 SUI / 30d",
};

const initialSlots = [
  { id: "S1", label: "Tactical Core", role: "Intel Only", pluginId: null as string | null },
  { id: "S2", label: "Economic Engine", role: "Economy Only", pluginId: null as string | null },
  { id: "S3", label: "Signal Bay", role: "Signals Only", pluginId: null as string | null },
  { id: "S4", label: "Auxiliary Dock", role: "Flexible", pluginId: null as string | null },
];

export default function StorePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | PluginCategory>("All");
  const [selected, setSelected] = useState<string>(plugins[0]?.id ?? "");
  const [slots, setSlots] = useState(initialSlots);
  const [activeSlotId, setActiveSlotId] = useState<string>(initialSlots[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      const category = categoryById[plugin.id];
      const matchCategory = activeCategory === "All" ? true : category === activeCategory;
      const matchQuery = q
        ? plugin.label.toLowerCase().includes(q) || plugin.description.toLowerCase().includes(q)
        : true;
      return matchCategory && matchQuery;
    });
  }, [query, activeCategory]);

  const selectedPlugin = plugins.find((p) => p.id === selected) ?? null;
  const activeSlot = slots.find((slot) => slot.id === activeSlotId) ?? slots[0];

  const canEquip = !!selectedPlugin && !activeSlot.role.includes("Only")
    ? true
    : !!selectedPlugin &&
      !!activeSlot &&
      (() => {
        const category = categoryById[selectedPlugin.id];
        if (activeSlot.role === "Flexible") return true;
        if (activeSlot.role === "Intel Only") return category === "Intel";
        if (activeSlot.role === "Economy Only") return category === "Economy";
        if (activeSlot.role === "Signals Only") return category === "Signals";
        return false;
      })();

  const equipToActiveSlot = () => {
    if (!selectedPlugin || !canEquip) return;
    setSlots((prev) => prev.map((slot) => (slot.id === activeSlot.id ? { ...slot, pluginId: selectedPlugin.id } : slot)));
  };

  const clearActiveSlot = () => {
    setSlots((prev) => prev.map((slot) => (slot.id === activeSlot.id ? { ...slot, pluginId: null } : slot)));
  };

  return (
    <ShellFrame
      title="PLUGIN MARKETPLACE"
      subtitle="Independent plugin route. Access via /store with catalog, preview, and multi-slot loadout."
      theme="store"
    >
      <div className="store-layout">
        <section className="column">
          <article className="panel store-toolbar">
            <div className="panel-title">
              <h2>Catalog Filters</h2>
              <span>{plugins.length} modules</span>
            </div>
            <div className="store-filters">
              <input
                className="input"
                placeholder="Search plugin..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="actions">
                {(["All", "Intel", "Economy", "Signals"] as const).map((category) => (
                  <button
                    key={category}
                    className={`btn ${activeCategory === category ? "btn-active" : ""}`}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Plugin Catalog</h2>
              <span>{filtered.length} results</span>
            </div>
            <div className="list scroll catalog-scroll">
              {filtered.map((plugin) => (
                <article
                  key={plugin.id}
                  className={`plugin-card ${selected === plugin.id ? "plugin-card-active" : ""}`}
                  onClick={() => setSelected(plugin.id)}
                >
                  <div className="panel-title">
                    <strong>
                      <span className={`cat-icon cat-${categoryById[plugin.id].toLowerCase()}`} aria-hidden="true" />
                      {plugin.label}
                    </strong>
                    <span>{categoryById[plugin.id]}</span>
                  </div>
                  <p>{plugin.description}</p>
                  <div className="meta-row">
                    <span>{plugin.effect}</span>
                    <span>{priceById[plugin.id]}</span>
                  </div>
                </article>
              ))}
              {filtered.length === 0 ? <p className="hint">No plugins matched current filters.</p> : null}
            </div>
          </article>
        </section>

        <aside className="store-side">
          <article className="panel plugin-preview">
            <div className="panel-title">
              <h2>Plugin Preview</h2>
              <span>{selectedPlugin ? selectedPlugin.id.toUpperCase() : "none"}</span>
            </div>
            {selectedPlugin ? (
              <>
                <h3>{selectedPlugin.label}</h3>
                <p>{selectedPlugin.description}</p>
                <div className="meta-row">
                  <span>{categoryById[selectedPlugin.id]}</span>
                  <span>{selectedPlugin.effect}</span>
                  <span>{priceById[selectedPlugin.id]}</span>
                </div>
                <p className="hint">Select a loadout slot below, then confirm from {activeSlot.id} Control.</p>
              </>
            ) : (
              <p className="hint">Select a plugin to inspect details and equip.</p>
            )}
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Loadout Slots</h2>
              <span>{slots.filter((slot) => slot.pluginId).length} / {slots.length}</span>
            </div>
            <div className="slot-grid">
              {slots.map((slot) => {
                const plugged = plugins.find((item) => item.id === slot.pluginId) ?? null;
                const active = slot.id === activeSlot.id;
                return (
                  <button
                    key={slot.id}
                    className={`slot-tile ${plugged ? "slot-filled" : ""} ${active ? "slot-active" : ""}`}
                    onClick={() => setActiveSlotId(slot.id)}
                  >
                    <div className="slot-head">
                      <strong>{slot.id}</strong>
                      <span>{slot.role}</span>
                    </div>
                    <p className="slot-label">{slot.label}</p>
                    {plugged ? <p>{plugged.label}</p> : <p>[Empty] {slot.id} - {slot.role}</p>}
                  </button>
                );
              })}
            </div>
            <article className="region-focus">
              <div className="panel-title">
                <strong>{activeSlot.id} Control</strong>
                <span>{activeSlot.role}</span>
              </div>
              <p className="hint">
                Assigned: {activeSlot.pluginId ? plugins.find((item) => item.id === activeSlot.pluginId)?.label : "None"}
              </p>
              {!canEquip && selectedPlugin ? (
                <p className="hint">Selected plugin category does not match this slot restriction.</p>
              ) : null}
              <div className="actions">
                <button className="btn btn-active" onClick={equipToActiveSlot} disabled={!selectedPlugin || !canEquip}>
                  Equip to {activeSlot.id}
                </button>
                <button className="btn" onClick={clearActiveSlot}>
                  Clear Slot
                </button>
              </div>
            </article>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Store Notes</h2>
              <span>Mock</span>
            </div>
            <ul>
              <li>Current release supports four independent loadout slots.</li>
              <li>Payment and activation hooks are already wired at data layer.</li>
              <li>UI will later connect to on-chain purchase confirmation flows.</li>
            </ul>
          </article>
        </aside>
      </div>
    </ShellFrame>
  );
}
