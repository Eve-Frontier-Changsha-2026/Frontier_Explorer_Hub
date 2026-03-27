"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LiveStats {
  activePilots: number;
  kills24h: number;
  defenseIndex: number;
  onlineAssemblies: number;
  factionCount: number;
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("opacity-100", "translate-y-0");
          el.classList.remove("opacity-0", "translate-y-6");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return (
    <div
      ref={ref}
      className={`opacity-0 translate-y-6 transition-all duration-700 ease-out ${className}`}
    >
      {children}
    </div>
  );
}

function useLiveStats(): { stats: LiveStats | null; loading: boolean } {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
    fetch(`${base}/api/world/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setStats({
          activePilots: data.players?.active ?? 0,
          kills24h: data.combat?.kills24h ?? 0,
          defenseIndex: data.defense?.defenseIndex ?? 0,
          onlineAssemblies: data.infrastructure?.onlineAssemblies ?? 0,
          factionCount: data.factions?.count ?? 0,
        });
      })
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const PAIN_POINTS = [
  {
    icon: "🛡",
    title: "Privacy Heatmap",
    desc: "K-anonymity aggregation protects coordinates. Free = delayed, Premium = real-time.",
  },
  {
    icon: "📡",
    title: "Intel & Risk Radar",
    desc: "On-chain threat markers → safe routes + regional risk index.",
  },
  {
    icon: "⚔",
    title: "Tactical Replay",
    desc: "Dual-source killmails + activity data → live kill feed.",
  },
  {
    icon: "💎",
    title: "Bounty Escrow",
    desc: "Stake → verify → dispute, fully on-chain lifecycle.",
  },
  {
    icon: "🔒",
    title: "Intel Marketplace",
    desc: "Encrypted intel at fixed price. Seal protocol guards pre-purchase privacy.",
  },
  {
    icon: "🧩",
    title: "Web3 dApp Store",
    desc: "On-chain Plugin Registry with revenue sharing.",
  },
];

const FEATURES = [
  {
    icon: "⌗",
    title: "Intel Network",
    desc: "Submit & browse real-time intelligence reports with severity classification, visualized on an aggregated heatmap.",
    color: "text-eve-danger",
  },
  {
    icon: "◎",
    title: "Bounty System",
    desc: "On-chain bounty creation with SUI escrow. Proof submission, verification & dispute resolution — fully decentralized.",
    color: "text-eve-gold",
  },
  {
    icon: "⧉",
    title: "Portal",
    desc: "Bookmark and embed external EVE tools (dotlan, zkillboard, ef-map) directly in-app via sandboxed iframe.",
    color: "text-eve-cold",
  },
  {
    icon: "⟐",
    title: "Dual-Source Data",
    desc: "Union of EVE EYES + Utopia API for comprehensive world awareness. Per-source freshness tracking with fallback resilience.",
    color: "text-eve-safe",
  },
];

const TECH = [
  "SUI Move",
  "Next.js 15",
  "Express",
  "TypeScript",
  "TanStack Query",
  "Tailwind CSS",
  "SQLite",
  "EVE EYES API",
  "Utopia API",
];

const ROADMAP = [
  {
    phase: "Phase 1",
    title: "Experience Enhancement",
    items: "deck.gl 3D Starmap, safe-route calculation, Merkle Proof frontend verification",
    color: "bg-eve-cold",
  },
  {
    phase: "Phase 2",
    title: "Platform Opening",
    items: "Plugin SDK + community marketplace, permission manifest, Module Federation",
    color: "bg-eve-gold",
  },
  {
    phase: "Phase 3",
    title: "Advanced Privacy & Decentralization",
    items: "Differential privacy (k-anonymity + noise), Walrus decentralized storage, reputation system",
    color: "bg-eve-safe",
  },
  {
    phase: "Phase 4",
    title: "Automation & Governance",
    items: "Subscription auto-renewal, multi-sig AdminCap, SSE real-time push, DAO governance",
    color: "bg-eve-danger",
  },
];

const TEAM = [
  {
    name: "Ramon",
    roles: ["系統規劃", "後端", "合約", "系統整合"],
  },
  {
    name: "Tommy",
    roles: ["UI 設計與實作", "遊戲分析", "遊戲測試", "功能再平衡"],
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const { stats, loading } = useLiveStats();

  return (
    <div className="min-h-screen bg-eve-space text-eve-text font-mono relative overflow-x-hidden">
      {/* Overlays */}
      <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.04]">
        <div className="w-full h-px bg-eve-cold/40 animate-scanline" />
      </div>
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-[0.18] bg-eve-noise" />

      {/* ============ HERO ============ */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-4 text-center">
        {/* Stars bg */}
        <div className="absolute inset-0 bg-eve-stars opacity-60 pointer-events-none" />

        {/* Decorative grid lines */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-0 w-full h-px bg-eve-panel-border/10" />
          <div className="absolute top-3/4 left-0 w-full h-px bg-eve-panel-border/10" />
          <div className="absolute top-0 left-1/4 w-px h-full bg-eve-panel-border/10" />
          <div className="absolute top-0 left-3/4 w-px h-full bg-eve-panel-border/10" />
        </div>

        <div className="relative z-10">
          <p className="text-sm tracking-[0.35em] text-eve-cold/80 uppercase mb-6 animate-slide-in">
            SUI Hackathon 2026 // Changsha
          </p>

          <h1
            className="text-[clamp(2.8rem,6vw,5.5rem)] font-bold tracking-[0.08em] leading-none mb-5 animate-data-decrypt"
          >
            FRONTIER
            <br />
            <span className="text-eve-gold">EXPLORER HUB</span>
          </h1>

          <p className="text-base text-eve-muted max-w-[560px] mx-auto mb-12 leading-relaxed animate-slide-in"
            style={{ animationDelay: "0.15s" }}
          >
            Real-time intelligence network for EVE Frontier,
            <br className="max-sm:hidden" />
            powered by SUI blockchain
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap animate-slide-in" style={{ animationDelay: "0.3s" }}>
            <Link
              href="/"
              className="border border-eve-gold text-eve-gold px-7 py-3 text-sm tracking-[0.2em] uppercase hover:bg-eve-gold/10 transition-colors"
            >
              Enter Hub &rarr;
            </Link>
            <a
              href="https://github.com/Eve-Frontier-Changsha-2026/Frontier_Explorer_Hub"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-eve-panel-border text-eve-muted px-6 py-3 text-sm tracking-[0.12em] uppercase hover:text-eve-text hover:border-eve-cold/50 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-pulse-dot">
          <span className="text-xs tracking-[0.3em] text-eve-muted/80 uppercase">Scroll</span>
          <span className="text-eve-muted/70">&#9660;</span>
        </div>
      </section>

      {/* ============ PAIN POINTS ============ */}
      <section className="py-20 px-4">
        <div className="max-w-[960px] mx-auto">
          <Section>
            <h2 className="text-sm tracking-[0.3em] text-eve-cold/80 uppercase text-center mb-4">
              Problems We Solve
            </h2>
            <p className="text-base text-eve-muted/80 text-center mb-12 max-w-[600px] mx-auto leading-relaxed">
              No unified intel layer in EVE Frontier — we built one.
            </p>
          </Section>

          <div className="grid grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-3">
            {PAIN_POINTS.map((p) => (
              <Section key={p.title}>
                <div className="border border-eve-panel-border/25 bg-[rgba(8,11,16,0.8)] p-5 h-full">
                  <span className="text-xl">{p.icon}</span>
                  <h3 className="text-sm font-bold mt-3 mb-2 text-eve-text">{p.title}</h3>
                  <p className="text-[0.82rem] text-eve-muted/85 leading-relaxed">{p.desc}</p>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* ============ LIVE STATS ============ */}
      <section className="relative py-16 px-4">
        <div className="max-w-[900px] mx-auto">
          <Section>
            <div className="flex items-center gap-2 justify-center mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-eve-danger animate-pulse-dot" />
              <span className="text-sm tracking-[0.3em] text-eve-danger/80 uppercase">
                Live World Status
              </span>
            </div>

            <div className="grid grid-cols-5 max-md:grid-cols-2 max-sm:grid-cols-1 gap-px bg-eve-panel-border/20">
              {[
                { label: "Active Pilots", value: stats?.activePilots, color: "text-eve-safe" },
                { label: "Kills / 24h", value: stats?.kills24h, color: "text-eve-danger" },
                { label: "Defense Index", value: stats?.defenseIndex?.toFixed(1), color: "text-eve-info" },
                { label: "Assemblies Online", value: stats?.onlineAssemblies, color: "text-eve-gold" },
                { label: "Factions", value: stats?.factionCount, color: "text-eve-cold" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="bg-[rgba(8,11,16,0.9)] p-5 text-center"
                >
                  <div className={`text-3xl font-bold ${m.color} ${loading ? "animate-pulse" : ""}`}>
                    {loading ? "—" : (m.value ?? "—")}
                  </div>
                  <div className="text-xs tracking-[0.15em] text-eve-muted/85 uppercase mt-2">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="py-16 px-4">
        <div className="max-w-[900px] mx-auto">
          <Section>
            <h2 className="text-sm tracking-[0.3em] text-eve-cold/80 uppercase text-center mb-10">
              Core Features
            </h2>
          </Section>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
            {FEATURES.map((f, i) => (
              <Section key={f.title}>
                <div
                  className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.85)] p-5 h-full hover:border-eve-cold/30 transition-colors"
                  style={{ transitionDelay: `${i * 0.08}s` }}
                >
                  <span className={`text-2xl ${f.color}`}>{f.icon}</span>
                  <h3 className="text-base font-bold mt-3 mb-2">{f.title}</h3>
                  <p className="text-sm text-eve-muted/85 leading-relaxed">{f.desc}</p>
                </div>
              </Section>
            ))}
          </div>
        </div>
      </section>

      {/* ============ ARCHITECTURE ============ */}
      <section className="py-16 px-4">
        <div className="max-w-[900px] mx-auto">
          <Section>
            <h2 className="text-sm tracking-[0.3em] text-eve-cold/80 uppercase text-center mb-10">
              Architecture
            </h2>

            <div className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.85)] p-6 overflow-x-auto">
              {/* Data Sources row */}
              <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                <ArchNode label="EVE EYES API" color="text-eve-info" />
                <ArchNode label="Utopia API" color="text-eve-safe" />
              </div>

              {/* Arrow down */}
              <div className="text-center text-eve-cold/50 text-sm mb-4">
                &#9660; poll every 5 min
              </div>

              {/* Middle layer */}
              <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                <ArchNode label="WorldAggregator" color="text-eve-gold" wide />
              </div>

              <div className="text-center text-eve-cold/50 text-sm mb-4">&#9660;</div>

              <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                <ArchNode label="Express Backend" color="text-eve-cold" wide />
              </div>

              <div className="flex items-center justify-center gap-6 mb-4">
                <div className="text-center text-eve-cold/50 text-sm">&#9660;</div>
                <div className="text-center text-eve-cold/50 text-sm">&#9661;</div>
              </div>

              {/* Bottom layer */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <ArchNode label="Next.js Frontend" color="text-eve-text" />
                <ArchNode label="SUI Blockchain" color="text-eve-danger" sub="Intel / Bounty / Escrow" />
              </div>
            </div>
          </Section>
        </div>
      </section>

      {/* ============ TECH STACK ============ */}
      <section className="py-16 px-4">
        <div className="max-w-[900px] mx-auto">
          <Section>
            <h2 className="text-sm tracking-[0.3em] text-eve-cold/80 uppercase text-center mb-8">
              Tech Stack
            </h2>

            <div className="flex flex-wrap justify-center gap-2">
              {TECH.map((t) => (
                <span
                  key={t}
                  className="border border-eve-panel-border/40 text-eve-muted text-sm px-4 py-2 tracking-wide hover:border-eve-cold/40 hover:text-eve-text transition-colors"
                >
                  {t}
                </span>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ============ TEAM ============ */}
      <section className="py-16 px-4">
        <div className="max-w-[900px] mx-auto">
          <Section>
            <h2 className="text-sm tracking-[0.3em] text-eve-cold/80 uppercase text-center mb-10">
              Team
            </h2>

            <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
              {TEAM.map((m) => (
                <div
                  key={m.name}
                  className="border border-eve-panel-border/30 bg-[rgba(8,11,16,0.85)] p-5 text-center"
                >
                  {/* Avatar placeholder */}
                  <div className="w-16 h-16 mx-auto mb-4 border border-eve-panel-border/40 flex items-center justify-center text-2xl text-eve-gold/60">
                    {m.name[0]}
                  </div>
                  <h3 className="text-lg font-bold mb-3">{m.name}</h3>
                  <div className="flex flex-wrap justify-center gap-2">
                    {m.roles.map((r) => (
                      <span
                        key={r}
                        className="border border-eve-panel-border/30 text-eve-muted/85 text-xs px-2.5 py-1"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ============ ROADMAP ============ */}
      <section className="py-16 px-4">
        <div className="max-w-[700px] mx-auto">
          <Section>
            <h2 className="text-sm tracking-[0.3em] text-eve-cold/80 uppercase text-center mb-10">
              Roadmap
            </h2>

            <div className="relative pl-6 border-l border-eve-panel-border/30">
              {ROADMAP.map((r, i) => (
                <div key={r.phase} className="mb-8 last:mb-0 relative">
                  {/* Dot */}
                  <div
                    className={`absolute -left-[calc(1.5rem+4px)] top-1 w-2 h-2 rounded-full ${r.color}`}
                  />
                  <div className="text-xs tracking-[0.2em] text-eve-muted/80 uppercase mb-1">
                    {r.phase}
                  </div>
                  <h3 className="text-base font-bold mb-1">{r.title}</h3>
                  <p className="text-sm text-eve-muted/85 leading-relaxed">{r.items}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-eve-panel-border/15 py-10 px-4 text-center">
        <p className="text-xs text-eve-muted/70 tracking-wide">
          Built for EVE Frontier &middot; SUI Hackathon Changsha 2026
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function ArchNode({
  label,
  color,
  wide,
  sub,
}: {
  label: string;
  color: string;
  wide?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`border border-eve-panel-border/40 bg-[rgba(4,7,11,0.9)] px-4 py-2.5 text-center ${
        wide ? "min-w-[240px]" : "min-w-[150px]"
      }`}
    >
      <div className={`text-sm font-bold ${color}`}>{label}</div>
      {sub && <div className="text-xs text-eve-muted/80 mt-0.5">{sub}</div>}
    </div>
  );
}
