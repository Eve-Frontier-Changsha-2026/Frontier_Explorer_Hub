import { useMemo, useState } from "react";
import { abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

type IntelType = "THREAT" | "RESOURCE" | "WRECKAGE" | "POPULATION";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type AccessTier = "FREE" | "PREMIUM";

type IntelItem = {
  id: string;
  title: string;
  sector: "A" | "B" | "C";
  type: IntelType;
  risk: RiskLevel;
  age: string;
  source: string;
  summary: string;
  bounty: number;
  coords: string;
};

const intelItems: IntelItem[] = [
  {
    id: "INT-7781",
    title: "Hostile Fleet Massing Near Sirius Corridor",
    sector: "B",
    type: "THREAT",
    risk: "CRITICAL",
    age: "2m ago",
    source: "Alliance Ops",
    summary: "Multiple signatures exceeded K-anon threshold. Route diversion recommended.",
    bounty: 120,
    coords: "X:210 / Y:-3110 / Z:807",
  },
  {
    id: "INT-7774",
    title: "High-Yield Ore Cluster Spotted in Outer Halo",
    sector: "A",
    type: "RESOURCE",
    risk: "MEDIUM",
    age: "6m ago",
    source: "Explorer Scout #03",
    summary: "Resource density high. Delayed reveal for free tier remains active.",
    bounty: 45,
    coords: "X:-4421 / Y:892 / Z:1708",
  },
  {
    id: "INT-7762",
    title: "Wreck Field Eligible for Recovery Auction",
    sector: "C",
    type: "WRECKAGE",
    risk: "LOW",
    age: "11m ago",
    source: "Recovery Guild",
    summary: "Debris ownership unresolved. Salvage rights can be claimed by bounty flow.",
    bounty: 30,
    coords: "X:1881 / Y:1344 / Z:-5532",
  },
  {
    id: "INT-7759",
    title: "Population Spike Around Frontier Node 04",
    sector: "B",
    type: "POPULATION",
    risk: "HIGH",
    age: "15m ago",
    source: "Heatmap Indexer",
    summary: "Pilot concentration rising quickly. Combat probability model elevated.",
    bounty: 65,
    coords: "X:620 / Y:-2100 / Z:512",
  },
];

function App() {
  const { handleConnect, handleDisconnect } = useConnection();
  const account = useCurrentAccount();

  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<"ALL" | "A" | "B" | "C">("ALL");
  const [riskFilter, setRiskFilter] = useState<"ALL" | RiskLevel>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | IntelType>("ALL");
  const [selectedIntelId, setSelectedIntelId] = useState<string>(intelItems[0].id);
  const [focusMap, setFocusMap] = useState(false);
  const [tier, setTier] = useState<AccessTier>("FREE");
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);

  const filteredIntel = useMemo(() => {
    return intelItems.filter((item) => {
      if (sectorFilter !== "ALL" && item.sector !== sectorFilter) return false;
      if (riskFilter !== "ALL" && item.risk !== riskFilter) return false;
      if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
      if (search && !`${item.title} ${item.summary} ${item.id}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [riskFilter, search, sectorFilter, typeFilter]);

  const selectedIntel = useMemo(
    () => filteredIntel.find((item) => item.id === selectedIntelId) ?? filteredIntel[0] ?? null,
    [filteredIntel, selectedIntelId]
  );

  const criticalCount = filteredIntel.filter((item) => item.risk === "CRITICAL").length;
  const highCount = filteredIntel.filter((item) => item.risk === "HIGH").length;
  const activeBounty = filteredIntel.reduce((sum, item) => sum + item.bounty, 0);

  return (
    <div className="intel-app">
      <div className="bg-noise" aria-hidden="true" />

      <header className="intel-header">
        <div className="brand-block">
          <span className="brand-tag">FRONTIER EXPLORER HUB</span>
          <h1>Intelligence Command Portal</h1>
        </div>
        <div className="header-actions">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search intel id, title, keyword..."
            className="search-input"
          />
          <div className="tier-wrap">
            <button className="mini-btn" onClick={() => setAccessMenuOpen((v) => !v)}>
              TIER: {tier}
            </button>
            {accessMenuOpen ? (
              <div className="tier-menu">
                <button
                  className={`tier-option ${tier === "FREE" ? "active" : ""}`}
                  onClick={() => {
                    setTier("FREE");
                    setAccessMenuOpen(false);
                  }}
                >
                  Free: delayed / blurred
                </button>
                <button
                  className={`tier-option ${tier === "PREMIUM" ? "active" : ""}`}
                  onClick={() => {
                    setTier("PREMIUM");
                    setAccessMenuOpen(false);
                  }}
                >
                  Premium: realtime / precise
                </button>
                <button className="tier-option" onClick={() => setAccessMenuOpen(false)}>
                  Single unlock (mock)
                </button>
              </div>
            ) : null}
          </div>
          <button className="action-btn" onClick={() => (account?.address ? handleDisconnect() : handleConnect())}>
            {account ? abbreviateAddress(account.address) : "CONNECT EVE VAULT"}
          </button>
        </div>
      </header>

      <section className="filter-row">
        <div className="chip-group">
          {["ALL", "A", "B", "C"].map((sector) => (
            <button
              key={sector}
              className={`filter-chip ${sectorFilter === sector ? "active" : ""}`}
              onClick={() => setSectorFilter(sector as "ALL" | "A" | "B" | "C")}
            >
              Sector {sector}
            </button>
          ))}
        </div>
        <div className="chip-group">
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((risk) => (
            <button
              key={risk}
              className={`filter-chip ${riskFilter === risk ? "active" : ""}`}
              onClick={() => setRiskFilter(risk as "ALL" | RiskLevel)}
            >
              {risk}
            </button>
          ))}
        </div>
        <div className="chip-group">
          {["ALL", "THREAT", "RESOURCE", "WRECKAGE", "POPULATION"].map((type) => (
            <button
              key={type}
              className={`filter-chip ${typeFilter === type ? "active" : ""}`}
              onClick={() => setTypeFilter(type as "ALL" | IntelType)}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      <main className="intel-layout">
        <section className="intel-main">
          <div className="kpi-grid">
            <article>
              <span>Critical Alerts</span>
              <strong>{criticalCount}</strong>
            </article>
            <article>
              <span>High Risk Signals</span>
              <strong>{highCount}</strong>
            </article>
            <article>
              <span>Total Bounty Pool</span>
              <strong>{activeBounty} SUI</strong>
            </article>
            <article>
              <span>Visible Intel Nodes</span>
              <strong>{filteredIntel.length}</strong>
            </article>
          </div>

          <section className="map-panel">
            <div className="panel-head">
              <h2>Tactical Heatmap</h2>
              <button className="mini-btn" onClick={() => setFocusMap(true)}>
                Expand map
              </button>
            </div>
            <div className="map-core">
              <div className="route r1" />
              <div className="route r2" />
              <div className="route r3" />
              {[
                { key: "A", className: "p-a" },
                { key: "B", className: "p-b" },
                { key: "C", className: "p-c" },
              ].map((point) => (
                <button
                  key={point.key}
                  className={`map-point ${point.className} ${sectorFilter === point.key ? "active" : ""}`}
                  onClick={() => setSectorFilter(point.key as "A" | "B" | "C")}
                >
                  {point.key}
                </button>
              ))}
              <span className="grid-note n1">RIFT_19</span>
              <span className="grid-note n2">NODE_04</span>
              <span className="grid-note n3">RELAY_77</span>
            </div>
          </section>

          <section className="feed-panel">
            <div className="panel-head">
              <h2>Intel Feed</h2>
              <span>{filteredIntel.length} records</span>
            </div>
            <div className="feed-list">
              {filteredIntel.map((item) => (
                <button key={item.id} className={`feed-item ${selectedIntel?.id === item.id ? "active" : ""}`} onClick={() => setSelectedIntelId(item.id)}>
                  <div className="feed-top">
                    <strong>{item.title}</strong>
                    <span className={`risk risk-${item.risk.toLowerCase()}`}>{item.risk}</span>
                  </div>
                  <div className="feed-meta">
                    <span>{item.id}</span>
                    <span>{item.type}</span>
                    <span>{item.sector}</span>
                    <span>{item.age}</span>
                  </div>
                  <p>{item.summary}</p>
                </button>
              ))}
            </div>
          </section>
        </section>

        <aside className="intel-side">
          <section className="detail-panel">
            <h3>Selected Intel</h3>
            {selectedIntel ? (
              <>
                <p className="detail-title">{selectedIntel.title}</p>
                <ul>
                  <li>ID: {selectedIntel.id}</li>
                  <li>Sector: {selectedIntel.sector}</li>
                  <li>Type: {selectedIntel.type}</li>
                  <li>Risk: {selectedIntel.risk}</li>
                  <li>Coords: {selectedIntel.coords}</li>
                  <li>Source: {selectedIntel.source}</li>
                </ul>
                <button className="action-btn full">Unlock full report (mock)</button>
              </>
            ) : (
              <p className="muted">No intel matches current filters.</p>
            )}
          </section>

          <section className="bounty-panel">
            <h3>Bounty Board</h3>
            <div className="bounty-row">
              <span>Track hostile fleet in Sirius Corridor</span>
              <strong>80 SUI</strong>
            </div>
            <div className="bounty-row">
              <span>Verify ore integrity in Outer Halo Vein</span>
              <strong>35 SUI</strong>
            </div>
            <div className="bounty-row">
              <span>Classify new wreck field ownership</span>
              <strong>28 SUI</strong>
            </div>
            <button className="action-btn full">Post bounty (mock)</button>
          </section>
        </aside>
      </main>

      {focusMap ? (
        <div className="overlay" onClick={() => setFocusMap(false)}>
          <div className="overlay-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <h2>Tactical Heatmap — Focus View</h2>
              <button className="mini-btn" onClick={() => setFocusMap(false)}>
                Close
              </button>
            </div>
            <div className="map-core focus">
              <div className="route r1" />
              <div className="route r2" />
              <div className="route r3" />
              <button className="map-point p-a">A</button>
              <button className="map-point p-b">B</button>
              <button className="map-point p-c">C</button>
              <span className="grid-note n1">RIFT_19</span>
              <span className="grid-note n2">NODE_04</span>
              <span className="grid-note n3">RELAY_77</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
