interface MetricChipProps {
  label: string;
  value: string;
}

export function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="border border-eve-panel-border bg-[rgba(8,11,16,0.68)] px-2 py-1.5">
      <span className="block text-[0.61rem] text-eve-muted">{label}</span>
      <strong className="text-xs tracking-wide">{value}</strong>
    </div>
  );
}
