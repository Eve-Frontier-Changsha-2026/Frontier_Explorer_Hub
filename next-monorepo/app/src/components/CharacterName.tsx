"use client";

import { useCharacterName } from "@/hooks/use-character";

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
  const { name, isLoading } = useCharacterName(address);
  const truncated = truncateAddr(address, truncateLength);

  if (isLoading) {
    return (
      <span
        className={`inline-block bg-eve-panel-border/30 animate-pulse rounded-sm ${className}`}
        style={{ width: `${truncateLength * 2 + 4}ch`, height: "1em" }}
      />
    );
  }

  if (name) {
    return (
      <span className={`text-eve-gold ${className}`} title={address}>
        {name}
        {showAddress && (
          <span className="text-eve-muted text-[0.6rem] ml-1">({truncated})</span>
        )}
      </span>
    );
  }

  return <span className={`text-eve-muted font-mono ${className}`}>{truncated}</span>;
}
