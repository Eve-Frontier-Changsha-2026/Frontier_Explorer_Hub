"use client";

import { useCharacter } from "@/hooks/use-character";

interface CharacterNameProps {
  address: string;
  truncateLength?: number;
  showAddress?: boolean;
  className?: string;
}

function truncateAddr(addr: string, len: number): string {
  if (addr.length <= len * 2 + 4) return addr;
  return `${addr.slice(0, len + 2)}...${addr.slice(-len)}`;
}

export function CharacterName({
  address,
  truncateLength = 6,
  showAddress = false,
  className = "",
}: CharacterNameProps) {
  const { data, isLoading } = useCharacter(address);
  const truncated = truncateAddr(address, truncateLength);

  if (isLoading) {
    return (
      <span
        className={`inline-block bg-eve-panel-border/30 animate-pulse rounded-sm ${className}`}
        style={{ width: `${truncateLength * 2 + 4}ch`, height: "1em" }}
      />
    );
  }

  if (data?.name) {
    const tooltipLines: string[] = [];
    if (data.tribeId != null) tooltipLines.push(`tribe #${data.tribeId}`);
    if (data.tenant) tooltipLines.push(data.tenant);
    if (data.itemId) tooltipLines.push(`item: ${data.itemId}`);

    return (
      <span className={`relative group inline-flex items-center ${className}`}>
        <span className="text-eve-gold cursor-default" title={address}>
          {data.name}
          {showAddress && (
            <span className="text-eve-muted text-[0.6rem] ml-1">({truncated})</span>
          )}
        </span>
        {tooltipLines.length > 0 && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-eve-panel border border-eve-panel-border text-[0.65rem] text-eve-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            {tooltipLines.join(" · ")}
          </span>
        )}
      </span>
    );
  }

  return <span className={`text-eve-muted font-mono ${className}`}>{truncated}</span>;
}
