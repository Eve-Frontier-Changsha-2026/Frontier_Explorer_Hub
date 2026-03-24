"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  targetMs: number;
  label?: string;
}

export function CountdownTimer({ targetMs, label }: CountdownTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = targetMs - now;
  if (diff <= 0) return <span className="text-red-400 text-xs font-mono">{label ? `${label}: ` : ""}Expired</span>;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  let display: string;
  if (days > 0) display = `${days}d ${hours}h`;
  else if (hours > 0) display = `${hours}h ${minutes}m`;
  else display = `${minutes}m ${seconds}s`;

  // Urgency colors
  const colorClass = diff > 3_600_000 ? "text-eve-cyan" : diff > 600_000 ? "text-amber-400" : "text-red-400";

  return (
    <span className={`${colorClass} text-xs font-mono`}>
      {label ? `${label}: ` : ""}{display}
    </span>
  );
}
