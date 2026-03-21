export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const headlines = [
  {
    id: "HDL-901",
    title: "Jump Gate Spine under coordinated scan jamming",
    summary: "Three jammer clusters appeared near transit lane J-4 and disrupted convoy telemetry.",
    risk: "CRITICAL" as RiskLevel,
    category: "Conflict",
    ts: "04:32 UTC"
  },
  {
    id: "HDL-902",
    title: "Outer colony migration wave exceeds shelter capacity",
    summary: "Population pods rerouted from two low-security stations with insufficient escort coverage.",
    risk: "HIGH" as RiskLevel,
    category: "Population",
    ts: "04:11 UTC"
  },
  {
    id: "HDL-903",
    title: "Ore corridor reopened for 47-minute extraction window",
    summary: "Dense debris lane temporarily stable; salvage fleets already entering from sector C.",
    risk: "MEDIUM" as RiskLevel,
    category: "Economy",
    ts: "03:58 UTC"
  },
  {
    id: "HDL-904",
    title: "Unknown burst packets synced across 4 relays",
    summary: "Signal pattern repeats every 19 seconds and matches archived Ancient Dark signatures.",
    risk: "HIGH" as RiskLevel,
    category: "Signals",
    ts: "03:47 UTC"
  }
];

export const timelineEvents = [
  { id: "EV-1", title: "Sector C convoy transponder blackout", age: "Today", detail: "Freighters lost telemetry after entering drift corridor." },
  { id: "EV-2", title: "Patch station reopened for emergency repairs", age: "Today", detail: "Dock throughput restored to 61% after reactor stabilization." },
  { id: "EV-3", title: "Dust-belt ore pocket detected", age: "1d", detail: "Extraction window estimated under one hour." },
  { id: "EV-4", title: "Ancient Dark hash signature repeated", age: "2d", detail: "Signal spacing matches pre-collapse archives." }
];

export const intelFeed = [
  { id: "INT-71001", system: 30000020, note: "Jammer activity near Citadel-3", risk: "CRITICAL" as RiskLevel, ts: "04:33" },
  { id: "INT-71002", system: 30000077, note: "Escort request from refugee convoy", risk: "HIGH" as RiskLevel, ts: "04:16" },
  { id: "INT-71003", system: 30003123, note: "Wreck field with unstable reactor", risk: "HIGH" as RiskLevel, ts: "04:03" },
  { id: "INT-71004", system: 30007801, note: "Ore lane opens for 40 minutes", risk: "MEDIUM" as RiskLevel, ts: "03:49" },
  { id: "INT-71005", system: 30011011, note: "Relay beacon restored", risk: "LOW" as RiskLevel, ts: "03:34" },
  { id: "INT-71006", system: 30015444, note: "Unknown frigate cluster sighted", risk: "HIGH" as RiskLevel, ts: "03:19" }
];

export const plugins = [
  { id: "trace", label: "Trace Matrix", effect: "+24% route prediction", description: "Pre-maps ambush vectors from hostile drift signatures." },
  { id: "auction", label: "Salvage Exchange", effect: "+18% wreck monetization", description: "Turns confirmed wreck intel into dynamic bounty packages." },
  { id: "civil", label: "Population Watch", effect: "+29% migration detection", description: "Tracks civilian pod lanes and collapse risk." },
  { id: "relay", label: "Signal Forensics", effect: "+31% anomalous ping capture", description: "Identifies repeated encoded relay patterns." }
];

export const subscriptionPlans = [
  { id: "free", title: "Free", price: "0 SUI", highlights: ["Zoom Level 0-1", "Delayed intel refresh", "Basic summary only"] },
  { id: "premium", title: "Premium", price: "30 SUI / 30d", highlights: ["Zoom Level 0-2", "10s live refresh", "Full type/severity breakdown"] }
];
