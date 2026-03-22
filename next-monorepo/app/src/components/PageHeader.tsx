import { StatusChip } from "./ui/StatusChip";
import { MetricChip } from "./ui/MetricChip";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  metrics?: { label: string; value: string }[];
  variant?: "default" | "store" | "membership";
}

export function PageHeader({ title, subtitle, metrics, variant = "default" }: PageHeaderProps) {
  const accentClass =
    variant === "store" ? "text-eve-info" : variant === "membership" ? "text-eve-gold" : "text-eve-cold";

  return (
    <>
      {/* Topbar */}
      <div className="border border-eve-panel-border bg-[rgba(7,9,13,0.93)] flex items-center gap-2.5 px-2.5 py-1.5">
        <StatusChip label="LIVE" active />
        <span className="text-[0.7rem] text-eve-muted">
          EVE Frontier open-source frontier intelligence monitor
        </span>
      </div>

      {/* Header */}
      <div className="mt-2.5 border border-eve-panel-border bg-gradient-to-b from-[rgba(10,13,18,0.96)] to-[rgba(7,10,15,0.96)] p-3 flex justify-between gap-4">
        <div>
          <span className={`border border-eve-panel-border text-[0.66rem] px-1.5 py-0.5 tracking-widest uppercase ${accentClass}`}>
            Frontier Explorer Hub
          </span>
          <h1 className="mt-1.5 text-[clamp(1.1rem,2.3vw,1.9rem)] tracking-wide font-bold">
            {title}
          </h1>
          <p className="mt-1.5 text-[0.72rem] text-eve-muted">{subtitle}</p>
        </div>
        {metrics && metrics.length > 0 && (
          <div className="grid grid-cols-3 gap-2 self-center" style={{ minWidth: 330 }}>
            {metrics.map((m) => (
              <MetricChip key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
