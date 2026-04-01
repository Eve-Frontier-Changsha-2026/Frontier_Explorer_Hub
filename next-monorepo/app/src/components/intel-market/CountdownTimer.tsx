"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  targetMs: number;
  label?: string;
}

export function CountdownTimer({ targetMs, label }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(targetMs - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(targetMs - Date.now());
    }, 60_000);
    return () => clearInterval(interval);
  }, [targetMs]);

  if (remaining <= 0) {
    return (
      <span className="text-[0.6rem] text-eve-danger animate-pulse-dot">
        {label ?? "EXPIRED"}
      </span>
    );
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  let color = "text-eve-muted";
  let anim = "";
  if (remaining < 3_600_000) {
    color = "text-eve-danger";
    anim = "animate-pulse-dot";
  } else if (remaining < 43_200_000) {
    color = "text-eve-warn";
  }

  const text =
    hours > 0 ? `⏱ ${hours}h ${minutes}m left` : `⏱ ${minutes}m left`;

  return <span className={`text-[0.6rem] ${color} ${anim}`}>{text}</span>;
}
