interface StatusChipProps {
  label: string;
  active?: boolean;
}

export function StatusChip({ label, active = false }: StatusChipProps) {
  return (
    <span
      className={`text-[0.64rem] tracking-widest border px-1.5 py-0.5 ${
        active
          ? "border-eve-danger/60 text-[#f2c4bc] animate-pulse-dot"
          : "border-eve-panel-border text-eve-muted"
      }`}
    >
      {label}
    </span>
  );
}
