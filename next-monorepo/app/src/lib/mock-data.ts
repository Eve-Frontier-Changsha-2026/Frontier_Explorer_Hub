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

export const plugins = [
  { id: "trace", label: "Trace Matrix", effect: "+24% route prediction", description: "Pre-maps ambush vectors from hostile drift signatures." },
  { id: "auction", label: "Salvage Exchange", effect: "+18% wreck monetization", description: "Turns confirmed wreck intel into dynamic bounty packages." },
  { id: "civil", label: "Population Watch", effect: "+29% migration detection", description: "Tracks civilian pod lanes and collapse risk." },
  { id: "relay", label: "Signal Forensics", effect: "+31% anomalous ping capture", description: "Identifies repeated encoded relay patterns." }
];

