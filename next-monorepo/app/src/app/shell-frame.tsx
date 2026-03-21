"use client";

import type { ReactNode } from "react";

type ShellFrameProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  theme?: "default" | "store" | "membership";
};

export function ShellFrame({ title, subtitle, children, theme = "default" }: ShellFrameProps) {
  return (
    <div className={`intel-app theme-${theme}`}>
      <div className="bg-noise" />

      <header className="monitor-topbar">
        <div className="live-chip">LIVE</div>
        <span className="topbar-text">EVE Frontier open-source frontier intelligence monitor</span>
      </header>

      <section className="monitor-header">
        <div className="brand-block">
          <span className="brand-tag">Frontier Explorer Hub</span>
          <h1>{title}</h1>
          <p className="subtitle-line">{subtitle}</p>
        </div>
        <div className="header-metrics">
          <div className="metric-chip">
            <span>Signal Integrity</span>
            <strong>61%</strong>
          </div>
          <div className="metric-chip">
            <span>Active Alerts</span>
            <strong>57</strong>
          </div>
          <div className="metric-chip">
            <span>Uplink</span>
            <strong>Nominal</strong>
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
