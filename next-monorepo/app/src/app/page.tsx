import { ShellFrame } from "./shell-frame";
import { headlines, timelineEvents, intelFeed } from "@/lib/mock-data";
import { riskClass } from "@/lib/risk-class";

export default function HomePage() {
  const breaking = headlines[0];

  return (
    <ShellFrame
      title="REAL-TIME FRONTIER INTEL DASHBOARD"
      subtitle="Operational monitor for conflict routes, signal anomalies, population drift, and bounty response."
    >
      <div className="dashboard">
        <section className="column">
          <article className="panel breaking">
            <div className="panel-title">
              <h2>Breaking</h2>
              <span className={riskClass(breaking.risk)}>{breaking.risk}</span>
            </div>
            <h2>{breaking.title}</h2>
            <p>{breaking.summary}</p>
            <div className="meta-row">
              <span>{breaking.id}</span>
              <span>{breaking.category}</span>
              <span>{breaking.ts}</span>
            </div>
          </article>

          <div className="brief-grid">
            <article className="panel">
              <div className="panel-title">
                <h2>Daily Briefing</h2>
                <span>AI Summary</span>
              </div>
              <p>
                Frontier pressure is concentrated on jump lanes and refinery belts. Recommended playbook: escort
                convoy traffic, prioritize relay diagnostics, and keep rapid-response bounty teams near reactor-live
                wreck zones.
              </p>
            </article>

            <article className="panel">
              <div className="panel-title">
                <h2>Headlines</h2>
                <span>{headlines.length} entries</span>
              </div>
              <div className="list scroll">
                {headlines.map((item) => (
                  <article key={item.id} className="item">
                    <div className="panel-title">
                      <strong>{item.title}</strong>
                      <span className={riskClass(item.risk)}>{item.risk}</span>
                    </div>
                    <div className="meta-row">
                      <span>{item.id}</span>
                      <span>{item.category}</span>
                      <span>{item.ts}</span>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </div>

          <article className="panel">
            <div className="panel-title">
              <h2>Events Timeline</h2>
              <span>Top Recent</span>
            </div>
            <div className="list">
              {timelineEvents.map((event) => (
                <article key={event.id} className="item">
                  <div className="panel-title">
                    <strong>{event.title}</strong>
                    <span>{event.age}</span>
                  </div>
                  <p>{event.detail}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        <aside className="side">
          <article className="panel">
            <div className="panel-title">
              <h2>Conflict Map</h2>
              <span>ef-map</span>
            </div>
            <div className="efmap-wrap">
              <iframe
                className="efmap-frame"
                src="https://ef-map.com/embed?embed=1"
                title="EVE Frontier map"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Live Intel Feed</h2>
              <span>{intelFeed.length} records</span>
            </div>
            <div className="list scroll">
              {intelFeed.map((item) => (
                <article key={item.id} className="feed-item">
                  <div className="panel-title">
                    <strong>{item.id}</strong>
                    <span className={riskClass(item.risk)}>{item.risk}</span>
                  </div>
                  <p>{item.note}</p>
                  <div className="meta-row">
                    <span>SYS-{item.system}</span>
                    <span>{item.ts} UTC</span>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title">
              <h2>Activity</h2>
              <span>7d</span>
            </div>
            <div className="grid-4">
              <article className="stat-card"><strong>182</strong><p>News Volume</p></article>
              <article className="stat-card"><strong>57</strong><p>Signal Alerts</p></article>
              <article className="stat-card"><strong>61%</strong><p>Route Stability</p></article>
              <article className="stat-card"><strong>88%</strong><p>Comms Availability</p></article>
            </div>
          </article>
        </aside>
      </div>
    </ShellFrame>
  );
}
