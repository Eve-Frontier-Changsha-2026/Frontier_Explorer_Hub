export function PortalEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
      <svg viewBox="0 0 24 24" className="w-10 h-10 text-eve-muted/40" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M4 4h16v16H4zM9 4v16M4 9h5" />
      </svg>
      <p className="text-sm text-eve-muted">No portal links yet</p>
      <p className="text-xs text-eve-muted/60">
        Add external tools, dashboards, or resources to access them from one place.
      </p>
    </div>
  );
}
