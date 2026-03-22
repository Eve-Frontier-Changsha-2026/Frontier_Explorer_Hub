import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
  animate?: boolean;
}

export function Panel({ title, badge, children, className = "", animate = true }: PanelProps) {
  return (
    <article
      className={`border border-eve-panel-border bg-eve-panel p-3 ${animate ? "animate-slide-in" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm tracking-wide uppercase text-eve-cold">{title}</h2>
        {badge && <span className="text-xs text-eve-muted">{badge}</span>}
      </div>
      {children}
    </article>
  );
}
