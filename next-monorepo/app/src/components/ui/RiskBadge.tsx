type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: "text-eve-danger border-eve-danger/50",
  HIGH: "text-eve-warn border-eve-warn/46",
  MEDIUM: "text-eve-info border-eve-panel-border",
  LOW: "text-eve-safe border-eve-panel-border",
};

function severityToRisk(severity: number): RiskLevel {
  if (severity >= 8) return "CRITICAL";
  if (severity >= 5) return "HIGH";
  if (severity >= 3) return "MEDIUM";
  return "LOW";
}

interface RiskBadgeProps {
  risk?: RiskLevel;
  severity?: number;
}

export function RiskBadge({ risk, severity }: RiskBadgeProps) {
  const level = risk ?? (severity != null ? severityToRisk(severity) : "LOW");
  return (
    <span
      className={`text-[0.6rem] border px-1 py-0.5 whitespace-nowrap ${RISK_COLORS[level]}`}
    >
      {level}
    </span>
  );
}
